import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import type { ImageContent, Usage } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { db } from "./config.js";
import { artifactOutput, checks, draftSchema, fieldsSchema, type Kind, type RunInput } from "./domain.js";
import { mediaBytes } from "./media.js";
import { contextBudget, ContextLimitError, estimateInput } from "./model-context.js";
import { recordModelUsage } from "./generation-log.js";
import { fileRef, rankSources, type FileRef } from "./workspace.js";

type Runtime = { runtime: ModelRuntime; model: NonNullable<ReturnType<ModelRuntime["getModel"]>> };
const labels = {
  search_workspace: "搜索资料", read_workspace_file: "读取文件", read_note: "读取草稿",
  edit_note: "准备改稿", check_note: "检查稿件", write_markdown: "准备 Markdown 产物",
};
type ToolName = keyof typeof labels;
export const toolProgressSchema = z.array(z.object({
  label: z.string().max(30), status: z.enum(["running", "done", "failed"]),
})).max(12);
export type ToolProgress = z.infer<typeof toolProgressSchema>;
export type StarTask = {
  draftId: string; ownerId: string; baseRevision: number; progress: (steps: ToolProgress) => Promise<void>;
};

export class StarToolError extends Error {}

function tool<S extends z.ZodType>(name: string, label: string, description: string, schema: S,
  execute: (args: z.infer<S>, signal?: AbortSignal) => Promise<unknown>): AgentTool {
  return { name, label, description, parameters: z.toJSONSchema(schema),
    execute: async (_id, params, signal) => {
      signal?.throwIfAborted();
      const value = await execute(schema.parse(params), signal);
      signal?.throwIfAborted();
      return { content: [{ type: "text", text: JSON.stringify(value) }], details: undefined };
    },
  };
}

export async function runToolLoop(pi: Runtime, systemPrompt: string, prompt: string, images: ImageContent[],
  tools: AgentTool[], output: number, progress?: StarTask["progress"]) {
  let calls = 0;
  let requests = 0;
  let requestStarted = 0;
  const steps: ToolProgress = [];
  const indexes = new Map<string, number>();
  const agent = new Agent({
    initialState: { model: pi.model, systemPrompt, tools },
    toolExecution: "sequential",
    streamFn: (model, context, options) => {
      if (++requests > 12) throw new StarToolError("工具调用次数已达上限，请缩小任务范围后重试。");
      requestStarted = performance.now();
      const parts = context.messages.flatMap((message) => "content" in message && Array.isArray(message.content)
        ? message.content.filter((part): part is ImageContent => part.type === "image") : []);
      const transcript = JSON.stringify(context, (key, value) => key === "data" ? undefined : value);
      if (estimateInput(systemPrompt, transcript, parts) > contextBudget(model.contextWindow, output).input) throw new ContextLimitError();
      return pi.runtime.streamSimple(model, context, { ...options, maxTokens: output, timeoutMs: 35_000, maxRetries: 0 });
    },
    beforeToolCall: async () => ++calls > 12 ? { block: true, reason: "已达工具调用上限", terminate: true } : undefined,
  });
  const timer = setTimeout(() => agent.abort(), progress ? 90_000 : 25_000);
  const unsubscribe = agent.subscribe(async (event) => {
    if (event.type === "message_end" && event.message.role === "assistant" && "usage" in event.message) {
      recordModelUsage(event.message.usage as Usage, String(event.message.stopReason), progress ? "generate" : "connection-test",
        undefined, Math.round(performance.now() - requestStarted));
    }
    if (!progress || (event.type !== "tool_execution_start" && event.type !== "tool_execution_end") ||
      !Object.hasOwn(labels, event.toolName)) return;
    if (event.type === "tool_execution_start" && steps.length < 12) {
      indexes.set(event.toolCallId, steps.length);
      steps.push({ label: labels[event.toolName as ToolName], status: "running" });
    } else if (event.type === "tool_execution_end") {
      const index = indexes.get(event.toolCallId);
      if (index === undefined) return;
      steps[index].status = event.isError ? "failed" : "done";
    }
    await progress(steps);
  });
  try {
    await agent.prompt(prompt, images);
    const reply = agent.state.messages.at(-1);
    if (reply?.role !== "assistant" || !("stopReason" in reply) || reply.stopReason !== "stop") {
      if (reply && "stopReason" in reply && reply.stopReason === "aborted") throw new StarToolError("工具任务已超时，请重试。");
      throw new StarToolError(calls >= 12 || requests >= 12 ? "工具调用次数已达上限，请缩小任务范围后重试。"
        : "工具任务未完成，请重试。");
    }
    const text = reply.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").trim()
      .replace(/^```(?:json)?\s*|\s*```$/gi, "");
    if (!text) throw new StarToolError("模型未返回工具任务结果，请重试。");
    return text;
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }
}

export async function probeToolLoop(pi: Runtime, images: ImageContent[]) {
  let called = false;
  const probe = tool("check_connection", "测试工具调用", "返回连接检查结果", z.object({ nonce: z.literal("star-check") }),
    async () => { called = true; return { receipt: "star-tool-ok" }; });
  const result = await runToolLoop(pi, "这是连接测试。按要求调用工具并复述回执。",
    "调用 check_connection，传入 nonce 为 star-check。收到工具结果后，只回复 receipt 的值。", images, [probe], 256);
  return called && result === "star-tool-ok";
}

const noteFields = fieldsSchema.partial();
const editSchema = z.object({
  fields: noteFields.optional(),
  replace: z.object({ original: z.string().min(1).max(4000), replacement: z.string().max(4000) }).optional(),
});

export function makeStarTools(task: StarTask, input: RunInput, kind: Kind, canWrite: boolean, vision: boolean, prompt = "") {
  let candidate = input.draft;
  let patch: z.infer<typeof noteFields> = {};
  let checked: { errors: string[]; warnings: string[]; verify: string[] } | undefined;
  let artifacts: z.infer<typeof artifactOutput>[] = [];
  let readChars = 0;
  let readImages = 0;
  let searches = 0;
  let unreadImages = false;
  const dependencies = new Map<string, FileRef>();
  const citations = new Map<string, FileRef>();
  const readSchema = z.object({ fileId: z.uuid(), versionId: z.uuid(), offset: z.number().int().min(0).max(12000).optional() });
  const localized = /第[一二三四五六七八九十\d]+段|指定段落|这[一个]?段|只改(?:开篇|开头|结尾)/u.test(prompt);
  const ordinal = prompt.match(/第([一二三四五六七八九十]|\d{1,2})段/u)?.[1];
  const paragraph = ordinal ? (/^\d/u.test(ordinal) ? Number(ordinal) : "一二三四五六七八九十".indexOf(ordinal) + 1) : null;
  const explicitFields = (["title", "body", "tags"] as const).filter((field) => ({
    title: /标题/u, body: /正文|段落|第.{1,4}段|开篇|开头|结尾|文案/u, tags: /标签/u,
  })[field].test(prompt));
  const draftFilter = { id: task.draftId, ownerId: task.ownerId, deletedAt: null, restoredRevision: { lte: task.baseRevision } };
  const allowedFiles = { draftId: task.draftId, deletedAt: null, draft: draftFilter };
  const tools = [
    tool("search_workspace", labels.search_workspace, "搜索当前草稿的资料，返回匹配的文件 ID、版本和类型。可改用其他关键词。",
      z.object({ query: z.string().trim().max(120) }), async ({ query }) => {
        if (++searches > 3) throw new Error("已达资料搜索上限，请根据当前结果读取。");
        const files = await db.workspaceFile.findMany({ where: allowedFiles, orderBy: { createdAt: "desc" }, take: 24,
          include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
        const refs = files.flatMap((file) => file.versions[0] ? [fileRef(file, file.versions[0])] : []);
        if (!query) return refs.slice(0, 6);
        const byName = await db.workspaceFile.findMany({ where: { ...allowedFiles, name: { contains: query, mode: "insensitive" } },
          take: 6, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
        const matches = await rankSources(refs, query, (ref) => files.find(({ id }) => id === ref.fileId)?.versions[0]?.objectKey);
        return [...new Map([...byName.flatMap((file) => file.versions[0] ? [fileRef(file, file.versions[0])] : []), ...matches]
          .map((ref) => [ref.fileId, ref])).values()].slice(0, 6);
      }),
    { ...tool("read_workspace_file", labels.read_workspace_file, "按 ID 和版本读取资料。文本通过 offset 分段，每次最多 1600 字。",
      readSchema,
      async () => { throw new Error("无法读取资料"); }),
      execute: async (_id, params, signal) => {
        const { fileId, versionId, offset = 0 } = readSchema.parse(params);
        const version = await db.workspaceVersion.findFirst({ where: { id: versionId, fileId, file: allowedFiles },
          include: { file: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } });
        if (!version) throw new Error("资料已移除或不属于当前草稿。");
        const ref = fileRef(version.file, version);
        const markRead = () => {
          const baseline = fileRef(version.file, version.file.versions[0]);
          const previous = dependencies.get(fileId);
          if (previous && previous.versionId !== baseline.versionId) throw new Error("资料版本已变化，请按最新资料重试。");
          citations.set(versionId, ref);
          dependencies.set(fileId, baseline);
        };
        const image = ref.mime.startsWith("image/");
        if (image && !vision) {
          unreadImages = true;
          throw new Error("当前模型无法读取图片。");
        }
        if (image ? ++readImages > 2 : readChars >= 6400) throw new Error("已达本次资料读取上限。");
        const bytes = await mediaBytes(version.objectKey);
        signal?.throwIfAborted();
        if (image) {
          markRead();
          return { content: [{ type: "text", text: JSON.stringify(ref) },
            { type: "image", mimeType: ref.mime, data: bytes.toString("base64") }], details: undefined };
        }
        const chars = Array.from(bytes.toString("utf8"));
        const excerpt = chars.slice(offset, offset + Math.min(1600, 6400 - readChars)).join("");
        readChars += Array.from(excerpt).length;
        if (excerpt) markRead();
        return { content: [{ type: "text", text: JSON.stringify({ ...ref, excerpt,
          nextOffset: offset + Array.from(excerpt).length < chars.length ? offset + Array.from(excerpt).length : null }) }], details: undefined };
      },
    } satisfies AgentTool,
    tool("read_note", labels.read_note, "查看本次任务的当前候选稿，返回标题、标签和正文片段。",
      z.object({ offset: z.number().int().min(0).max(12000).optional() }),
      async ({ offset = 0 }) => ({ ...noteFields.parse(candidate), body: candidate.body.slice(offset, offset + 3200),
        nextOffset: offset + 3200 < candidate.body.length ? offset + 3200 : null })),
    tool("check_note", labels.check_note, "检查当前候选稿。可提供有待核对的原文，说明依据不足。",
      z.object({ verify: z.array(z.string().max(150)).max(5).optional() }), async ({ verify }) => {
        const { errors, warnings } = checks(candidate);
        checked = { errors, warnings, verify: (verify ?? []).filter((claim) => claim && (candidate.body.includes(claim) || candidate.title.includes(claim))) };
        return checked;
      }),
  ];
  if (canWrite && kind !== "plan" && !input.mediaOnly && input.planWritesNote !== false) tools.push(
    tool("edit_note", labels.edit_note, "准备文案变更。局部改稿使用 replace，指定一处唯一的正文原文；整篇起稿或用户明确要求整段重写才替换正文。",
      editSchema, async ({ fields, replace }) => {
        if (!replace && !Object.keys(fields ?? {}).length) throw new Error("请指定修改字段或原文片段。");
        if (replace && fields?.body !== undefined) throw new Error("请单独提交整篇正文或局部替换。");
        const next = { ...fields };
        if (kind === "revise" && !input.creativeTask && !input.planExecution &&
          (localized && fields?.body !== undefined || explicitFields.length > 0 &&
            [...Object.keys(next), ...(replace ? ["body"] : [])].some((field) => !explicitFields.some((allowed) => allowed === field)))) {
          throw new Error("修改超出指定范围，请对指定字段或片段重新提交。");
        }
        if (replace) {
          const at = candidate.body.indexOf(replace.original);
          if (at < 0 || at !== candidate.body.lastIndexOf(replace.original)) throw new Error("原文不唯一或未找到，请缩小范围或向用户确认。");
          if (paragraph !== null && paragraph !== undefined &&
            !candidate.body.split(/\r?\n[^\S\r\n]*\r?\n/u)[paragraph - 1]?.includes(replace.original)) {
            throw new Error("替换的原文不在用户指定的段落。");
          }
          next.body = candidate.body.slice(0, at) + replace.replacement + candidate.body.slice(at + replace.original.length);
        }
        candidate = draftSchema.parse({ ...candidate, ...next });
        patch = { ...patch, ...next };
        checked = undefined;
        return { fields: Object.keys(next), checks: checks(candidate) };
      }),
  );
  if (kind !== "plan" && input.artifactWrite) tools.push(
    tool("write_markdown", labels.write_markdown, "准备保存完整 Markdown。已有文件使用授权的目标顺序。一次提交所需全部产物。",
      z.object({ outputs: z.array(artifactOutput).min(1).max(3) }), async ({ outputs }) => {
        const expected = input.artifactCount ?? (input.artifactWrite === "update" ? input.artifactTargets?.length : undefined);
        if (expected && outputs.length !== expected) throw new Error("产物数量与用户授权不符。");
        artifacts = outputs;
        return { staged: outputs.length };
      }),
  );
  return { tools, outcome: () => ({ patch: checked && Object.keys(patch).length ? patch : undefined,
    uncheckedEdit: Boolean(Object.keys(patch).length && !checked), artifacts: artifacts.length ? artifacts : undefined,
    dependencies: [...dependencies.values()], citations: [...citations.values()], toolChecks: checked, unreadImages }) };
}
