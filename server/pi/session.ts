import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  createAgentSessionRuntime,
  createAgentSessionServices,
  createAgentSessionFromServices,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type AgentSession, type AgentSessionEvent,
  type AgentSessionRuntime,
  type AgentSessionServices,
  type CreateAgentSessionRuntimeFactory,
  type SessionTreeNode,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { env } from "../config.js";
import { draftPaths, ensureWorkspace, listWorkspace, workspaceBrief } from "./workspace.js";
import type { PiEventLog } from "./events.js";
import { createUiContext, type AskQuestionItem, type AskUserAnswer, type UiBridge, type UiRequest } from "./ui.js";
import { createStarExtension, starSystemPrompt, type StarBridge } from "./star-extension.js";
import { createGuardExtension } from "./guard.js";
import { readSessionJsonl, renderSessionHtml, writeImport } from "./transfer.js";
import type { PiTurnContext } from "./turn.js";
import { mediaArtifact, projectEvent, projectMessages, trimPayload } from "./presentation.js";

const PAGE_SIZE = 60;
type RequestStatus = "running" | "waiting" | "succeeded" | "failed" | "cancelled";
export type RequestOutcome = { requestId: string; sessionId: string; status: RequestStatus; error?: string };
type PromptInput = {
  text: string;
  mode: "send" | "steer" | "followUp";
  requestId: string;
  sessionId?: string;
  turn?: PiTurnContext;
};
type ActiveRequest = PromptInput & { sessionId: string; stopReason?: string; error?: string; delivered: boolean };

function unavailable(message: string, statusCode = 409, code = "SESSION_MISMATCH") {
  return Object.assign(new Error(message), { statusCode, code });
}

export type ModelChoice = { provider: string; id: string; name: string; reasoning: boolean; contextWindow?: number };

export type SessionState = {
  draftId: string;
  sessionId: string;
  sessionFile: string | null;
  model: ModelChoice | null;
  thinkingLevel: string;
  availableThinkingLevels: string[];
  busy: boolean;
  compacting: boolean;
  steering: string[];
  followUp: string[];
  pendingUi: number;
  pendingRequests: UiRequest[];
  cursor: number;
  messages: unknown[];
  messageStart: number;
  artifacts: NonNullable<ReturnType<typeof mediaArtifact>>[];
  readiness: { ready: boolean; reason?: string };
  stats: { userMessages: number; assistantMessages: number; toolCalls: number; tokens: number } | null;
};

export type SessionSummary = { id: string; file: string; name: string | null; updatedAt: string | null; messageCount: number | null };

/** 仅允许操作当前草稿会话目录下的 .jsonl 记录文件，防止路径穿越。 */
export function isSafeSessionFile(sessionsDir: string, candidate: string): boolean {
  if (!candidate) return false;
  const base = resolve(sessionsDir);
  const target = resolve(candidate);
  return target.endsWith(".jsonl") && relative(base, dirname(target)) === "";
}

export async function ownedSessionFile(paths: { sessions: string; workspace: string }, candidate: string, sessionId?: string) {
  if (!isSafeSessionFile(paths.sessions, candidate)) throw unavailable("会话不在当前草稿目录内", 404);
  const file = resolve(candidate);
  const info = await lstat(file);
  const [actual, directory, parent] = await Promise.all([
    realpath(file), realpath(paths.sessions), realpath(dirname(paths.sessions)),
  ]);
  if (!info.isFile() || relative(directory, dirname(actual)) !== "" ||
    relative(resolve(parent, basename(paths.sessions)), directory) !== "") {
    throw unavailable("会话文件归属不匹配", 404);
  }
  const lines = createInterface({ input: createReadStream(actual, "utf8"), crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const header = JSON.parse(line) as { type?: string; id?: string; cwd?: string };
      if (header.type !== "session" || !header.id || (sessionId && sessionId !== header.id) ||
        !header.cwd || relative(resolve(paths.workspace), resolve(header.cwd)) !== "") break;
      return actual;
    }
  } finally {
    lines.close();
  }
  throw unavailable("会话文件的标识或工作区不匹配", 404);
}

async function persistEmptySession(manager: SessionManager) {
  const file = manager.getSessionFile();
  const header = manager.getHeader();
  if (!file || !header) return;
  try {
    await writeFile(file, [header, ...manager.getEntries()].map((entry) => JSON.stringify(entry)).join("\n") + "\n", { flag: "wx" });
    manager.setSessionFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

export class PiSessionBusy extends Error {
  constructor(readonly kind: "streaming" | "handoff") {
    super(kind === "handoff" ? "会话正在移交给网页终端" : "会话正在执行，请先停止或选择插话/追加");
  }
}

type Options = {
  draftId: string;
  ownerId: string;
  log: PiEventLog;
  bridge: Omit<StarBridge, "askUser">;
  agentDir?: string;
  reportOutcome?: (outcome: RequestOutcome) => Promise<void>;
};

export class DraftSession {
  private runtime?: AgentSessionRuntime;
  private services?: AgentSessionServices;
  private unsubscribe?: () => void;
  private ui?: UiBridge;
  private state: { steering: string[]; followUp: string[] } = { steering: [], followUp: [] };
  private modelOverride?: { provider: string; id: string };
  private handoff = false;
  private revoked = false;
  private lastFile: string | null = null;
  /** 并发 open 单飞锁，避免 React 严格模式/双请求同时为同一草稿新建两份空白会话。 */
  private opening?: Promise<SessionState>;
  private activeRequest?: ActiveRequest;
  private pendingRequests = new Map<string, ActiveRequest>();
  private promptStarting = false;
  private outcomeWrites = new Map<string, Promise<void>>();
  private readonly displayText = new WeakMap<object, string>();
  /** 已获授权的联网目标，只在本会话内存里生效。 */
  private readonly authorized = new Set<string>();

  constructor(private readonly options: Options) {}

  get draftId() {
    return this.options.draftId;
  }

  get ownerId() {
    return this.options.ownerId;
  }

  get cursor() {
    return this.options.log.lastSeq;
  }

  private get session(): AgentSession | undefined {
    return this.runtime?.session;
  }

  get sessionFile() {
    return this.session?.sessionFile ?? this.lastFile;
  }

  private askUser(
    payload: { title: string; summary?: string; questions: AskQuestionItem[] },
    signal?: AbortSignal,
  ): Promise<AskUserAnswer> {
    if (!this.ui) return Promise.resolve({ answers: {}, cancelled: true });
    return this.ui.askUser(payload, { signal });
  }

  private factory(): CreateAgentSessionRuntimeFactory {
    return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        settingsManager: SettingsManager.inMemory({}),
        resourceLoaderOptions: {
          extensionFactories: [
            createStarExtension({
              ...this.options.bridge,
              askUser: (payload, signal) => this.askUser(payload, signal),
              currentTurn: () => this.activeRequest?.turn
                ? { ...this.activeRequest.turn, requestId: this.activeRequest.requestId, sessionId: this.activeRequest.sessionId }
                : undefined,
            }),
            createGuardExtension({
              authorized: this.authorized,
              report: (decision) => this.options.log.append("guard", { ...decision }),
            }),
          ],
          systemPrompt: starSystemPrompt(),
          noExtensions: true,
          noSkills: false,
          noPromptTemplates: false,
          noThemes: true,
          noContextFiles: true,
          disabledBuiltinExtensions: ["mcp", "codemode", "tool_search"],
        },
      });
      // 内联扩展需要显式 reload，否则工具不会进入本次会话。
      await services.resourceLoader.reload();
      const model = this.modelOverride ? services.modelRuntime.getModel(this.modelOverride.provider, this.modelOverride.id) : undefined;
      const created = await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        tools: ["+ls", "+grep", "+find"],
        ...(model ? { model } : {}),
      });
      return { ...created, services, diagnostics: services.diagnostics };
    };
  }

  async open(sessionFile?: string | null, sessionId?: string) {
    if (this.opening) return this.opening;
    if (this.runtime) return this.snapshot();
    this.opening = this.openInternal(sessionFile, sessionId).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  private async openInternal(sessionFile?: string | null, sessionId?: string) {
    if (this.handoff) throw new PiSessionBusy("handoff");
    this.handoff = false;
    const paths = await ensureWorkspace(this.options.draftId);
    const agentDir = this.options.agentDir || getAgentDir();
    const target = sessionFile
      ? await ownedSessionFile(paths, sessionFile, sessionId).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        if (!sessionId || !basename(sessionFile).endsWith(`_${sessionId}.jsonl`)) throw unavailable("当前会话记录已不存在", 404);
        return null;
      })
      : sessionId ? null : (await this.sessions())?.[0]?.file ?? null;
    const manager = target
      ? SessionManager.open(target, paths.sessions, paths.workspace)
      : SessionManager.create(paths.workspace, paths.sessions, sessionId ? { id: sessionId } : undefined);
    await persistEmptySession(manager);
    this.runtime = await createAgentSessionRuntime(this.factory(), {
      cwd: paths.workspace,
      agentDir,
      sessionManager: manager,
    });
    this.runtime.setRebindSession(async () => {
      await this.attach();
    });
    this.services = this.runtime.services;
    this.lastFile = this.runtime.session.sessionFile ?? this.lastFile;
    await this.attach();
    for (const { data } of this.options.log.unfinishedRequests()) {
      if (typeof data.requestId === "string" && typeof data.sessionId === "string") {
        this.report({ requestId: data.requestId, sessionId: data.sessionId, status: "failed", error: "运行器中断，原请求已结束，请重新提交" });
      }
    }
    return this.snapshot();
  }

  private async attach() {
    const session = this.runtime?.session;
    if (!session) return;
    await persistEmptySession(session.sessionManager);
    this.services = this.runtime?.services;
    this.lastFile = session.sessionFile ?? this.lastFile;
    this.unsubscribe?.();
    this.ui?.cancelAll();
    const ui = createUiContext((request) => this.options.log.append("ui", {
      ...request, sessionId: session.sessionManager.getSessionId(), requestId: this.activeRequest?.requestId,
    }), (count, pendingRequests) => {
      if (this.activeRequest) this.report({
        requestId: this.activeRequest.requestId,
        sessionId: this.activeRequest.sessionId,
        status: count ? "waiting" : "running",
      });
      this.options.log.append("state", { ...this.liveState(), pendingUi: count, pendingRequests });
    });
    this.ui = ui;
    await session.bindExtensions({ uiContext: ui.context, mode: "rpc" });
    // 收敛为只读资料工具 + 摘星业务工具（star_*），屏蔽 bash/write/edit 避免编程或越权写文件。
    const known = session.getAllTools().map((tool) => tool.name);
    const readonlyBuiltins = new Set(["read", "ls", "grep", "find"]);
    const allowed = known.filter((name) => readonlyBuiltins.has(name) || name.startsWith("star_"));
    session.setActiveToolsByName(allowed);
    this.unsubscribe = session.subscribe((event) => this.forward(event));
    this.options.log.append("session_changed", {
      sessionId: session.sessionManager.getSessionId(),
      sessionFile: session.sessionFile ?? null,
      name: session.sessionManager.getSessionName() ?? null,
    });
    this.options.log.append("state", this.liveState());
  }

  private forward(event: AgentSessionEvent) {
    const type = event.type;
    const sessionId = this.session?.sessionManager.getSessionId();
    const message = "message" in event ? event.message : undefined;
    if (type === "message_start" && message?.role === "user") {
      const delivered = this.activeRequest?.delivered;
      const plain = typeof message.content === "string" ? message.content :
        message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
      const next = delivered ? [...this.pendingRequests.values()].find((request) => !request.delivered && request.text === plain) : this.activeRequest;
      if (next) {
        if (delivered && this.activeRequest && this.activeRequest !== next) this.finish(this.activeRequest);
        this.activeRequest = next;
        next.delivered = true;
        const text = next.turn?.userText ?? next.text;
        this.displayText.set(message, text);
        if (sessionId && typeof message.timestamp === "number") {
          this.options.log.append("user_message", { sessionId, timestamp: message.timestamp, text });
        }
      }
    }
    if (type === "message_end" && event.message.role === "assistant" && this.activeRequest) {
      this.activeRequest.stopReason = event.message.stopReason;
      this.activeRequest.error = event.message.errorMessage;
    }
    const artifact = type === "tool_execution_end" && !event.isError
      ? mediaArtifact(event.toolCallId, event.toolName, event.result)
      : null;
    this.options.log.append("session", {
      event: projectEvent(event as AgentSessionEvent & Record<string, unknown>, message && typeof message === "object" ? this.displayText.get(message) : undefined),
      type, sessionId, requestId: this.activeRequest?.requestId, ...(artifact ? { artifact } : {}),
    });
    if (type === "queue_update") {
      const update = event as { steering?: readonly string[]; followUp?: readonly string[] };
      this.state = { steering: [...(update.steering ?? [])], followUp: [...(update.followUp ?? [])] };
      this.options.log.append("state", this.liveState());
    }
    if (type === "agent_start" || type === "agent_settled" || type === "agent_end") {
      this.options.log.append("state", this.liveState());
    }
    if (type === "thinking_level_changed") {
      this.options.log.append("state", this.liveState());
    }
    if (type === "compaction_start") this.options.log.append("compaction", { phase: "start" });
    if (type === "compaction_end") this.options.log.append("compaction", { phase: "end" });
  }

  private liveState() {
    const session = this.session;
    return {
      sessionId: session?.sessionManager.getSessionId() ?? null,
      sessionFile: session?.sessionFile ?? null,
      model: this.modelInfo() ?? null,
      thinkingLevel: session?.thinkingLevel ?? "off",
      availableThinkingLevels: session?.getAvailableThinkingLevels() ?? ["off"],
      busy: this.promptStarting || Boolean(session?.isStreaming),
      compacting: Boolean(session?.isCompacting),
      steering: this.state.steering,
      followUp: this.state.followUp,
      handoff: this.handoff,
      readiness: this.readiness(),
      pendingUi: this.ui?.pendingCount() ?? 0,
      pendingRequests: this.ui?.pendingRequests() ?? [],
      cursor: this.options.log.lastSeq,
    };
  }

  private modelInfo(): ModelChoice | null {
    const model = this.session?.model;
    if (!model) return null;
    return { provider: model.provider, id: model.id, name: model.name ?? model.id, reasoning: Boolean(model.reasoning), contextWindow: model.contextWindow };
  }

  private isModelAllowed(provider: string, id: string) {
    return !env.piAllowedModels.length || env.piAllowedModels.includes(`${provider}/${id}`);
  }

  private readiness(): { ready: boolean; reason?: string } {
    const model = this.modelInfo();
    if (!model) return { ready: false, reason: "请在 Pi 中配置并选择文字模型" };
    if (!this.isModelAllowed(model.provider, model.id)) return { ready: false, reason: "当前模型不在允许范围内，请切换模型" };
    if (!this.services?.modelRuntime.hasConfiguredAuth(model.provider)) return { ready: false, reason: "当前模型供应商尚未配置 Pi 凭据" };
    return { ready: true };
  }

  history(before?: number) {
    const session = this.session;
    const all = session?.messages ?? [];
    const end = before === undefined ? all.length : Math.min(before, all.length);
    const messageStart = Math.max(0, end - PAGE_SIZE);
    const page = all.slice(messageStart, end);
    const sessionId = session?.sessionManager.getSessionId() ?? "";
    const artifacts = page.flatMap((message) => {
      if (message.role !== "toolResult" || message.isError) return [];
      const artifact = mediaArtifact(message.toolCallId, message.toolName, message);
      return artifact ? [artifact] : [];
    });
    const messages = projectMessages(page, (message) => {
      if (!message || typeof message !== "object") return undefined;
      const timestamp = (message as { timestamp?: number }).timestamp;
      return this.displayText.get(message) ?? (timestamp === undefined ? undefined : this.options.log.userText(sessionId, timestamp));
    });
    return { sessionId, messageStart, messages, artifacts };
  }

  snapshot(): SessionState {
    const session = this.session;
    const stats = session?.getSessionStats();
    return {
      ...this.history(),
      draftId: this.options.draftId,
      sessionId: session?.sessionManager.getSessionId() ?? "",
      sessionFile: session?.sessionFile ?? null,
      model: this.modelInfo(),
      thinkingLevel: session?.thinkingLevel ?? "off",
      availableThinkingLevels: session?.getAvailableThinkingLevels() ?? ["off"],
      busy: this.promptStarting || Boolean(session?.isStreaming),
      compacting: Boolean(session?.isCompacting),
      steering: this.state.steering,
      followUp: this.state.followUp,
      pendingUi: this.ui?.pendingCount() ?? 0,
      pendingRequests: this.ui?.pendingRequests() ?? [],
      cursor: this.options.log.lastSeq,
      readiness: this.readiness(),
      stats: stats ? {
        userMessages: stats.userMessages, assistantMessages: stats.assistantMessages,
        toolCalls: stats.toolCalls, tokens: stats.tokens.input + stats.tokens.output,
      } : null,
    };
  }

  private report(outcome: RequestOutcome) {
    const previous = this.options.log.request(outcome.requestId)?.data;
    if (previous?.status === outcome.status || ["succeeded", "failed", "cancelled"].includes(String(previous?.status))) return;
    this.options.log.append("request", outcome);
    if (!this.options.reportOutcome) return;
    const persist = this.options.reportOutcome;
    const write = (this.outcomeWrites.get(outcome.requestId) ?? Promise.resolve()).then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await persist(outcome);
          return;
        } catch {
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }).finally(() => {
      if (this.outcomeWrites.get(outcome.requestId) === write) this.outcomeWrites.delete(outcome.requestId);
    });
    this.outcomeWrites.set(outcome.requestId, write);
  }

  private finish(request: ActiveRequest, status?: RequestStatus, error?: string) {
    if (!this.pendingRequests.delete(request.requestId)) return;
    if (this.activeRequest === request) this.activeRequest = undefined;
    const result = status ?? (request.stopReason === "aborted" ? "cancelled" :
      request.stopReason === "error" || request.stopReason === "length" ? "failed" : "succeeded");
    const detail = error ?? request.error ?? (request.stopReason === "length" ? "模型输出未完成，已达到长度限制" : undefined);
    this.report({ requestId: request.requestId, sessionId: request.sessionId, status: result, ...(detail ? { error: detail.slice(0, 500) } : {}) });
  }

  assertSession(sessionId?: string) {
    if (sessionId && this.session?.sessionManager.getSessionId() !== sessionId) throw unavailable("当前会话已变化，请刷新后重新提交");
  }

  async prompt(input: PromptInput) {
    const session = this.session;
    if (!session) throw new Error("会话尚未打开");
    if (this.handoff) throw new PiSessionBusy("handoff");
    this.assertSession(input.sessionId);
    const sessionId = session.sessionManager.getSessionId();
    const previous = this.options.log.request(input.requestId)?.data;
    if (previous) {
      if (previous.sessionId !== sessionId) throw unavailable("请求已属于另一个会话");
      return { queued: input.mode !== "send", mode: input.mode, status: previous.status, duplicate: true };
    }
    if (this.promptStarting || (!session.isStreaming && this.activeRequest) || (session.isStreaming && input.mode === "send")) {
      throw new PiSessionBusy("streaming");
    }
    if (!this.isModelAllowed(session.model?.provider ?? "", session.model?.id ?? "")) {
      throw unavailable("当前模型不在允许范围内，请切换模型", 503, "MODEL_UNAVAILABLE");
    }
    const queued = session.isStreaming;
    const request: ActiveRequest = { ...input, sessionId, delivered: false };
    if (!queued) {
      this.promptStarting = true;
      this.activeRequest = request;
    }
    this.pendingRequests.set(input.requestId, request);
    this.report({ requestId: input.requestId, sessionId, status: "running" });
    try {
      await this.options.log.flush();
      if (queued) {
        const outcome = input.mode === "steer" ? await session.steer(input.text) : await session.followUp(input.text);
        if (outcome === "handled") this.finish(request, "succeeded");
        return { queued: outcome === "queued", mode: input.mode };
      }
      await new Promise<void>((resolve, reject) => {
        void session.prompt(input.text, {
          preflightResult: () => {
            this.promptStarting = false;
            resolve();
          },
        }).then(() => {
          if (this.activeRequest) this.finish(this.activeRequest);
          for (const pending of [...this.pendingRequests.values()]) {
            this.finish(pending, "cancelled", "请求未进入模型处理");
          }
          this.promptStarting = false;
          this.options.log.append("state", this.liveState());
          resolve();
        }, (error: unknown) => {
          const message = error instanceof Error ? error.message : "Pi 执行失败";
          if (this.activeRequest) this.finish(this.activeRequest, "failed", message);
          for (const pending of [...this.pendingRequests.values()]) this.finish(pending, "cancelled");
          this.promptStarting = false;
          this.options.log.append("state", this.liveState());
          reject(unavailable(message, 503, "PI_EXECUTION_FAILED"));
        });
      });
      return { queued: false, mode: input.mode };
    } catch (error) {
      this.finish(request, "failed", error instanceof Error ? error.message : undefined);
      if (!queued) this.promptStarting = false;
      this.options.log.append("state", this.liveState());
      throw error;
    }
  }

  async stop() {
    const session = this.session;
    if (!session) return;
    // 排队的插话/追加在停止后不会被投递，留着会让会话一直显示在执行中。
    const dropped = session.clearQueue();
    for (const request of [...this.pendingRequests.values()]) this.finish(request, "cancelled");
    this.ui?.cancelAll();
    if (session.isStreaming) await session.abort().catch(() => undefined);
    await Promise.race([session.waitForIdle(), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => undefined);
    this.options.log.append("state", { ...this.liveState(), dropped });
  }

  async answer(
    id: string,
    payload: { value?: string; confirmed?: boolean; cancelled?: boolean; answers?: Record<string, string | string[]>; useRecommended?: boolean },
  ) {
    if (!this.ui?.respond(id, payload)) throw unavailable("这个操作已经结束，无需再回应", 409, "UI_REQUEST_SETTLED");
    this.options.log.append("state", this.liveState());
  }

  async setModel(provider: string, id: string) {
    const session = this.session;
    const runtime = this.services?.modelRuntime;
    if (!session || !runtime) throw new Error("会话尚未打开");
    if (!this.isModelAllowed(provider, id)) throw unavailable("当前模型不在允许范围内", 400, "MODEL_UNAVAILABLE");
    const model = runtime.getModel(provider, id);
    if (!model) throw new Error("没有找到该模型，请先在 Pi 配置中登录或添加");
    await session.setModel(model);
    this.modelOverride = { provider, id };
    this.options.log.append("state", this.liveState());
    return this.modelInfo();
  }

  async setThinking(level: ThinkingLevel) {
    const session = this.session;
    if (!session) throw new Error("会话尚未打开");
    session.setThinkingLevel(level);
    this.options.log.append("state", this.liveState());
  }

  async compact(instructions?: string) {
    const session = this.session;
    if (!session) throw new Error("会话尚未打开");
    if (session.isStreaming) throw new PiSessionBusy("streaming");
    void session.compact(instructions).catch((error: unknown) => {
      this.options.log.append("error", { message: error instanceof Error ? error.message : String(error) });
    });
    return { accepted: true };
  }

  async models(): Promise<ModelChoice[]> {
    const runtime = this.services?.modelRuntime;
    if (!runtime) return [];
    const available = await runtime.getAllAvailable().catch(() => []);
    const all = available.flatMap((model) => {
      if (!("reasoning" in model) || !("provider" in model)) return [];
      return [{
        provider: String(model.provider), id: model.id, name: model.name ?? model.id,
        reasoning: Boolean(model.reasoning), contextWindow: model.contextWindow,
      }];
    });
    if (!env.piAllowedModels.length) return all;
    const allowed = new Set(env.piAllowedModels);
    const current = this.modelInfo();
    const order = new Map(env.piAllowedModels.map((key, index) => [key, index]));
    return all
      .filter((item) => {
        const key = `${item.provider}/${item.id}`;
        return allowed.has(key) || (current && current.provider === item.provider && current.id === item.id);
      })
      .sort((a, b) => (order.get(`${a.provider}/${a.id}`) ?? 999) - (order.get(`${b.provider}/${b.id}`) ?? 999));
  }

  async sessions(): Promise<SessionSummary[] | null> {
    const paths = draftPaths(this.options.draftId);
    let list: Awaited<ReturnType<typeof SessionManager.list>>;
    try {
      const expected = await readdir(paths.sessions, { withFileTypes: true });
      list = await SessionManager.list(paths.workspace, paths.sessions);
      if (list.length !== expected.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).length) return null;
      await Promise.all(list.map((item) => ownedSessionFile(paths, item.path, item.id)));
    } catch {
      return null;
    }
    return list.map((item) => ({
      id: item.id,
      file: item.path,
      name: item.name ?? null,
      updatedAt: item.modified ? new Date(item.modified).toISOString() : null,
      messageCount: item.messageCount ?? null,
    }));
  }

  async tree() {
    const manager = this.session?.sessionManager;
    if (!manager) return { leafId: null, nodes: [] as SessionTreeNode[], sessions: await this.sessions() };
    return { leafId: manager.getLeafId(), nodes: trimPayload(manager.getTree()) as SessionTreeNode[], sessions: await this.sessions() };
  }

  async clone(label?: string) {
    const session = this.session;
    if (!session?.sessionFile) throw new Error("当前会话还没有可克隆的记录");
    if (this.promptStarting || session.isStreaming) throw new PiSessionBusy("streaming");
    const paths = draftPaths(this.options.draftId);
    const fork = SessionManager.forkFrom(session.sessionFile, paths.workspace, paths.sessions);
    const next = fork.getSessionFile();
    if (!next) throw new Error("克隆会话失败");
    await this.runtime?.switchSession(await ownedSessionFile(paths, next));
    if (label) this.session?.setSessionName(label);
    return this.snapshot();
  }

  async fork(entryId: string, position: "before" | "at" = "before") {
    if (!this.runtime) throw new Error("会话尚未打开");
    if (this.promptStarting || this.session?.isStreaming) throw new PiSessionBusy("streaming");
    const result = await this.runtime.fork(entryId, { position });
    if (result.cancelled) throw new Error("分叉被取消");
    return this.snapshot();
  }

  async newSession(name?: string) {
    if (!this.runtime) throw new Error("会话尚未打开");
    if (this.promptStarting || this.session?.isStreaming) throw new PiSessionBusy("streaming");
    const result = await this.runtime.newSession();
    if (result.cancelled) throw unavailable("新建会话已取消");
    if (name) this.session?.setSessionName(name);
    return this.snapshot();
  }

  async switchSession(file: string, sessionId?: string) {
    if (!this.runtime) throw new Error("会话尚未打开");
    if (this.promptStarting || this.session?.isStreaming) throw new PiSessionBusy("streaming");
    const owned = await ownedSessionFile(draftPaths(this.options.draftId), file, sessionId);
    const result = await this.runtime.switchSession(owned);
    if (result.cancelled) throw unavailable("切换会话已取消");
    return this.snapshot();
  }

  async rename(name: string) {
    this.session?.setSessionName(name);
    this.options.log.append("state", this.liveState());
  }

  /** 删除指定对话记录；若删的是当前对话，会先切换到最近历史对话或开启新空白对话，再删磁盘文件。 */
  async deleteSession(input: { sessionId?: string; file?: string | null }) {
    if (!this.runtime) throw new Error("会话尚未打开");
    if (this.promptStarting || this.session?.isStreaming) throw new PiSessionBusy("streaming");
    const paths = draftPaths(this.options.draftId);
    const diskSessions = await this.sessions();
    if (!diskSessions) throw unavailable("无法确认当前会话清单，请稍后重试", 503, "SESSION_INVENTORY_UNAVAILABLE");
    const target = diskSessions.find((entry) => input.sessionId ? entry.id === input.sessionId : entry.file === input.file);
    if (!target) throw unavailable("当前草稿没有这条会话记录", 404);
    const targetFile = await ownedSessionFile(paths, target.file, target.id);
    const isCurrent = target.id === this.session?.sessionManager.getSessionId();
    if (isCurrent) {
      const replacement = diskSessions.find((entry) => entry.id !== target.id);
      if (replacement) await this.switchSession(replacement.file, replacement.id);
      else await this.newSession();
    }
    try {
      await rm(targetFile);
    } catch (error) {
      if (isCurrent) await this.switchSession(targetFile, target.id).catch(() => undefined);
      throw error;
    }

    return { state: this.snapshot(), sessions: await this.sessions() };
  }

  /** 技能、提示模板与扩展清单，供网页命令面板使用。 */
  palette() {
    const loader = this.services?.resourceLoader;
    const skills = loader?.getSkills().skills ?? [];
    const prompts = loader?.getPrompts().prompts ?? [];
    const extensions = loader?.getExtensions().extensions ?? [];
    return {
      skills: skills.map((skill) => ({ name: skill.name, description: skill.description, path: skill.filePath })),
      prompts: prompts.map((prompt) => ({
        name: prompt.name, description: prompt.description,
        argumentHint: prompt.argumentHint ?? null, preview: prompt.content.slice(0, 160),
      })),
      extensions: extensions.map((extension) => ({
        path: extension.path,
        tools: Array.from(extension.tools.keys()),
        commands: Array.from(extension.commands.keys()),
        handlers: Array.from(extension.handlers.keys()),
      })),
    };
  }

  /** 重载技能、提示模板与扩展定义；已绑定的工具保持不变，下一次提问生效。 */
  async reload() {
    const loader = this.services?.resourceLoader;
    if (!loader) throw new Error("会话尚未打开");
    await loader.reload();
    const counts = this.palette();
    this.options.log.append("resources", { skills: counts.skills.length, prompts: counts.prompts.length, extensions: counts.extensions.length });
    return counts;
  }

  async exportSession(format: "jsonl" | "html", meta: { title: string }) {
    const file = this.session?.sessionFile ?? this.lastFile;
    if (!file) throw new Error("当前会话还没有可导出的记录");
    if (format === "jsonl") return { format, filename: `${meta.title || "pi-session"}-${Date.now()}.jsonl`, body: await readSessionJsonl(file) };
    const html = renderSessionHtml((this.session?.messages ?? []) as never, {
      draftId: this.options.draftId, title: meta.title || "Pi 会话",
      sessionId: this.session?.sessionManager.getSessionId() ?? "", model: this.modelInfo()?.name ?? null,
      exportedAt: new Date().toISOString(),
    });
    return { format, filename: `${meta.title || "pi-session"}-${Date.now()}.html`, body: html };
  }

  async importSession(content: string) {
    if (!this.runtime) throw new Error("会话尚未打开");
    if (this.promptStarting || this.session?.isStreaming) throw new PiSessionBusy("streaming");
    const paths = draftPaths(this.options.draftId);
    const written = await writeImport(paths.sessions, content);
    await this.runtime.importFromJsonl(written.path, paths.workspace);
    this.options.log.append("import", { sessionId: written.sessionId, sha256: written.sha256 });
    return { ...this.snapshot(), importedFrom: written.sha256 };
  }

  /** 终端接管前调用：停止执行并让出会话文件。 */
  async releaseForTerminal() {
    const session = this.session;
    if (session?.isStreaming) await session.abort().catch(() => undefined);
    session?.clearQueue();
    this.handoff = true;
    this.ui?.cancelAll();
    await this.runtime?.dispose().catch(() => undefined);
    this.runtime = undefined;
    this.unsubscribe?.();
    this.options.log.append("handoff", { state: "terminal" });
  }

  async reclaimFromTerminal(sessionFile?: string | null) {
    this.handoff = false;
    await this.open(sessionFile ?? this.sessionFile);
    this.options.log.append("handoff", { state: "web" });
    return this.snapshot();
  }

  async revoke() {
    this.revoked = true;
    this.ui?.cancelAll();
    this.unsubscribe?.();
    for (const request of [...this.pendingRequests.values()]) this.finish(request, "cancelled");
    if (this.session?.isStreaming) await this.session.abort().catch(() => undefined);
    await this.runtime?.dispose().catch(() => undefined);
    this.runtime = undefined;
    await Promise.all(this.outcomeWrites.values());
  }

  get isOpen() {
    return Boolean(this.runtime) && !this.handoff;
  }

  get isRevoked() {
    return this.revoked;
  }

  async contextBundle() {
    return { files: await workspaceBrief(this.options.draftId), filesList: await listWorkspace(this.options.draftId) };
  }
}

export function newSessionLabel(kind: "new" | "fork" | "clone") {
  const stamp = new Date().toISOString().slice(5, 16).replace("T", " ");
  return `${kind === "new" ? "新会话" : kind === "fork" ? "分叉" : "克隆"} ${stamp}`;
}

export function requestId() {
  return randomUUID();
}
