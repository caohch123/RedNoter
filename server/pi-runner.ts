import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import Fastify from "fastify";
import { z } from "zod";
import { env } from "./config.js";
import { sseFrame } from "./pi/events.js";
import { closeSession, ensureSession, entryOf, sweep, touch } from "./pi/registry.js";
import { PiSessionBusy } from "./pi/session.js";
import { piTurnContextSchema } from "./pi/turn.js";
import { closeTerminal, findTerminal, openTerminal, resizeTerminal, sseTerminalFrame, terminalOfDraft, writeTerminal } from "./pi/terminal.js";
import {
  deleteWorkspacePath,
  draftPaths,
  importReferences,
  listWorkspaceDetail,
  MAX_PREVIEW_BYTES,
  readWorkspaceFile,
  resolveWorkspacePaths,
  writeWorkspaceFiles,
} from "./pi/workspace.js";

const app = Fastify({ logger: { level: process.env.PI_LOG_LEVEL ?? "info" }, bodyLimit: 32 * 1024 * 1024 });

function runnerError(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

function assertWorkspaceWritable(draftId: string) {
  const terminal = terminalOfDraft(draftId);
  if (terminal && !terminal.exited) {
    throw runnerError(409, "SESSION_HANDOFF", "会话正在网页终端中运行，请先关闭终端再修改工作区");
  }
  if (entryOf(draftId)?.session.snapshot().busy) {
    throw runnerError(409, "SESSION_BUSY", "Pi 正在执行，请等待完成或先停止后再修改工作区");
  }
}

const token = env.piRunnerToken;
if (!token) app.log.warn("PI_RUNNER_TOKEN 未配置，运行器会话接口不可用");

app.addHook("onRequest", async (request, reply) => {
  if (request.url.startsWith("/health")) return;
  if (!token) return reply.code(503).send({ code: "PI_RUNNER_UNAVAILABLE", message: "运行器凭据未配置" });
  const provided = Buffer.from(String(request.headers["x-pi-runner-token"] ?? ""));
  const expected = Buffer.from(token);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    reply.code(401).send({ code: "UNAUTHORIZED", message: "运行器凭据无效" });
  }
});

const refSchema = z.object({ ownerId: z.string().min(1).max(200) });
const sessionRefSchema = refSchema.extend({ sessionFile: z.string().max(4000).nullable().optional(), sessionId: z.string().min(1).max(200).optional() });

function draftIdOf(request: { params: unknown }) {
  return z.object({ draftId: z.uuid() }).parse(request.params).draftId;
}

async function openSession(draftId: string, ownerId: string, sessionFile?: string | null, sessionId?: string) {
  await entryOf(draftId, ownerId)?.closing?.catch(() => undefined);
  const entry = ensureSession({ draftId, ownerId });
  await entry.log.load();
  if (!entry.session.isOpen) await entry.session.open(sessionFile, sessionId);
  return entry;
}

app.get("/health", async () => ({ ok: true, sessions: ["ok"] }));

app.post("/drafts/:draftId/open", async (request) => {
  const draftId = draftIdOf(request);
  const body = sessionRefSchema.parse(request.body);
  const entry = await openSession(draftId, body.ownerId, body.sessionFile, body.sessionId);
  const [models, sessions] = await Promise.all([entry.session.models(), entry.session.sessions()]);
  return { state: entry.session.snapshot(), models, sessions };
});

app.get("/drafts/:draftId/state", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId, sessionFile, sessionId } = sessionRefSchema.parse(request.query);
  const entry = await openSession(draftId, ownerId, sessionFile, sessionId);
  const [models, sessions] = await Promise.all([entry.session.models(), entry.session.sessions()]);
  return { state: entry.session.snapshot(), models, sessions };
});

app.get("/drafts/:draftId/history", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId, sessionId, before } = refSchema.extend({
    sessionId: z.string().min(1).max(200), before: z.coerce.number().int().min(0),
  }).parse(request.query);
  const entry = entryOf(draftId, ownerId);
  if (!entry?.session.isOpen) throw runnerError(409, "SESSION_MISMATCH", "会话尚未打开，请刷新后再试");
  entry.session.assertSession(sessionId);
  return entry.session.history(before);
});

app.get("/drafts/:draftId/events", async (request, reply) => {
  const draftId = draftIdOf(request);
  const query = sessionRefSchema.extend({ after: z.coerce.number().int().min(0).optional() }).parse(request.query);
  const lastEventId = Number(request.headers["last-event-id"] ?? 0);
  const after = Math.max(query.after ?? 0, Number.isFinite(lastEventId) ? lastEventId : 0);
  const entry = await openSession(draftId, query.ownerId, query.sessionFile, query.sessionId);
  const log = entry.log;
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const subscription = log.subscribeFrom(after, (record) => reply.raw.write(sseFrame(record)), () => {
    const state = entry.session.snapshot();
    reply.raw.write(sseFrame({ type: "snapshot", at: Date.now(), seq: state.cursor, data: { state } }));
    return state.cursor;
  });
  const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    subscription.close();
    detach();
    reply.raw.end();
  };
  const detach = log.onClose(close);
  reply.raw.on("close", close);
  await subscription.ready.catch((error: unknown) => {
    request.log.warn({ err: error }, "事件回放失败");
    close();
  });
  touch(draftId);
});

const promptSchema = refSchema.extend({
  text: z.string().min(1).max(60_000),
  mode: z.enum(["send", "steer", "followUp"]).default("send"),
  requestId: z.string().min(8).max(200),
  sessionId: z.string().min(1).max(200).optional(),
  turn: piTurnContextSchema.optional(),
});

app.post("/drafts/:draftId/prompt", async (request, reply) => {
  const draftId = draftIdOf(request);
  const body = promptSchema.parse(request.body);
  const entry = await openSession(draftId, body.ownerId, undefined, body.sessionId);
  const already = entry.log.lastSeq;
  try {
    const result = await entry.session.prompt(body);
    return { ...result, requestId: body.requestId, acceptedAtSeq: already };
  } catch (error) {
    if (error instanceof PiSessionBusy) {
      return reply.code(409).send({ code: error.kind === "handoff" ? "SESSION_HANDOFF" : "SESSION_BUSY", message: error.message });
    }
    throw error;
  }
});

app.get("/drafts/:draftId/request-outcomes/:requestId", async (request) => {
  const draftId = draftIdOf(request);
  const { requestId } = z.object({ requestId: z.string().min(8).max(200) }).parse(request.params);
  const { ownerId, sessionId } = refSchema.extend({ sessionId: z.string().min(1).max(200) }).parse(request.query);
  const entry = entryOf(draftId, ownerId);
  const result = entry?.log.request(requestId);
  if (!result || result.data.sessionId !== sessionId) throw runnerError(404, "REQUEST_NOT_FOUND", "请求记录尚不可用");
  return { status: result.data.status, error: result.data.error, updatedAt: result.at };
});

app.post("/drafts/:draftId/stop", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId } = refSchema.parse(request.body);
  const entry = entryOf(draftId, ownerId);
  await entry?.session.stop();
  return { state: entry?.session.snapshot() ?? null };
});

app.post("/drafts/:draftId/answer", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({
    id: z.string().min(1),
    value: z.string().optional(),
    confirmed: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    useRecommended: z.boolean().optional(),
    answers: z.record(z.string(), z.union([z.string().max(1000), z.array(z.string().max(200)).max(10)])).optional(),
  }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  await entry.session.answer(body.id, {
    value: body.value,
    confirmed: body.confirmed,
    cancelled: body.cancelled,
    useRecommended: body.useRecommended,
    answers: body.answers,
  });
  return { ok: true };
});

app.get("/drafts/:draftId/models", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId } = refSchema.parse(request.query);
  const entry = await openSession(draftId, ownerId);
  return { models: await entry.session.models(), state: entry.session.snapshot() };
});

app.post("/drafts/:draftId/model", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ provider: z.string().min(1).max(100), id: z.string().min(1).max(200) }).parse(request.body);
  const entry = await openSession(draftId, body.ownerId);
  return { model: await entry.session.setModel(body.provider, body.id) };
});

app.post("/drafts/:draftId/thinking", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ level: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]) }).parse(request.body);
  const entry = await openSession(draftId, body.ownerId);
  await entry.session.setThinking(body.level);
  return { state: entry.session.snapshot() };
});

app.post("/drafts/:draftId/compact", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ instructions: z.string().max(2000).optional() }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  return entry.session.compact(body.instructions);
});

app.get("/drafts/:draftId/tree", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId } = refSchema.parse(request.query);
  const entry = await openSession(draftId, ownerId);
  return entry.session.tree();
});

app.post("/drafts/:draftId/sessions/new", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ name: z.string().max(120).optional() }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  return { state: await entry.session.newSession(body.name) };
});

app.post("/drafts/:draftId/sessions/switch", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ file: z.string().min(1).max(4000), sessionId: z.string().min(1).max(200) }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  return { state: await entry.session.switchSession(body.file, body.sessionId) };
});

app.post("/drafts/:draftId/sessions/fork", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ entryId: z.string().min(1), position: z.enum(["before", "at"]).default("before") }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  return { state: await entry.session.fork(body.entryId, body.position) };
});

app.post("/drafts/:draftId/sessions/clone", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ label: z.string().max(120).optional() }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  return { state: await entry.session.clone(body.label) };
});

app.post("/drafts/:draftId/sessions/delete", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({
    sessionId: z.string().min(1).max(200).optional(),
    file: z.string().max(4000).nullable().optional(),
  }).parse(request.body);
  const entry = await openSession(draftId, body.ownerId);
  return entry.session.deleteSession({ sessionId: body.sessionId, file: body.file ?? null });
});

app.post("/drafts/:draftId/name", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ name: z.string().trim().min(1).max(120) }).parse(request.body);
  const entry = entryOf(draftId, body.ownerId);
  if (!entry) throw new Error("会话尚未打开");
  await entry.session.rename(body.name);
  return { ok: true };
});

app.get("/drafts/:draftId/files", async (request) => {
  const draftId = draftIdOf(request);
  refSchema.parse(request.query);
  return listWorkspaceDetail(draftId);
});

app.post("/drafts/:draftId/files", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({
    conflict: z.enum(["overwrite", "rename"]).default("overwrite"),
    files: z.array(z.object({
      path: z.string().min(1).max(500),
      body: z.string().max(16_000_000),
    })).max(200),
    emptyDirs: z.array(z.string().min(1).max(500)).max(100).default([]),
  }).parse(request.body);
  assertWorkspaceWritable(draftId);
  try {
    const items = body.files.map((item) => ({ path: item.path, body: Buffer.from(item.body, "base64") }));
    const result = await writeWorkspaceFiles(draftId, items, {
      conflict: body.conflict,
      emptyDirs: body.emptyDirs,
    });
    touch(draftId);
    return result;
  } catch (error) {
    throw runnerError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "上传工作区文件失败");
  }
});

app.delete("/drafts/:draftId/files", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ path: z.string().min(1).max(500) }).parse(request.body);
  assertWorkspaceWritable(draftId);
  try {
    const result = await deleteWorkspacePath(draftId, body.path);
    touch(draftId);
    return { ok: true, ...result };
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      throw runnerError(404, "NOT_FOUND", error instanceof Error ? error.message : "文件或目录不存在");
    }
    throw runnerError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "无法删除该路径");
  }
});

app.post("/drafts/:draftId/resolve-paths", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ paths: z.array(z.string().min(1).max(500)).max(10) }).parse(request.body);
  try {
    return { entries: await resolveWorkspacePaths(draftId, body.paths) };
  } catch (error) {
    throw runnerError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "工作区路径无效");
  }
});

app.get("/drafts/:draftId/palette", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId } = refSchema.parse(request.query);
  const entry = await openSession(draftId, ownerId);
  return entry.session.palette();
});

app.post("/drafts/:draftId/reload", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId } = refSchema.parse(request.body);
  const entry = entryOf(draftId, ownerId);
  if (!entry) throw new Error("会话尚未打开");
  return entry.session.reload();
});

app.get("/drafts/:draftId/export", async (request) => {
  const draftId = draftIdOf(request);
  const query = refSchema.extend({
    format: z.enum(["jsonl", "html"]).default("jsonl"),
    title: z.string().max(120).optional(),
  }).parse(request.query);
  const entry = await openSession(draftId, query.ownerId);
  return entry.session.exportSession(query.format, { title: query.title ?? "Pi 会话" });
});

app.post("/drafts/:draftId/import", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ content: z.string().min(2).max(24 * 1024 * 1024) }).parse(request.body);
  const entry = await openSession(draftId, body.ownerId);
  try {
    return { state: await entry.session.importSession(body.content) };
  } catch (error) {
    if (error instanceof PiSessionBusy) throw error;
    throw Object.assign(new Error(error instanceof Error ? error.message : "无法导入会话"), { statusCode: 400 });
  }
});

app.post("/drafts/:draftId/references", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({
    refs: z.array(z.object({
      fileId: z.string().min(1), versionId: z.string().min(1), version: z.number().int().min(1),
      name: z.string().min(1).max(200), mime: z.string().min(1).max(120), body: z.string().max(8_000_000),
    })).max(6),
  }).parse(request.body);
  const imported = await importReferences(draftId, body.refs.map((ref) => ({
    fileId: ref.fileId, versionId: ref.versionId, version: ref.version, name: ref.name, mime: ref.mime,
    body: Buffer.from(ref.body, "base64"),
  })));
  return { refs: imported };
});

app.get("/drafts/:draftId/file", async (request, reply) => {
  const draftId = draftIdOf(request);
  const { path } = z.object({ path: z.string().min(1).max(500) }).parse(request.query);
  try {
    const file = await readWorkspaceFile(draftId, path, MAX_PREVIEW_BYTES);
    reply
      .type(file.mime)
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff");
    if (file.mime === "text/html" || file.mime === "image/svg+xml") {
      reply.header("content-security-policy", "sandbox");
    }
    return file.body;
  } catch (error) {
    return reply.code(404).send({ message: error instanceof Error ? error.message : "无法读取文件" });
  }
});

app.post("/drafts/:draftId/terminal", async (request) => {
  const draftId = draftIdOf(request);
  const body = refSchema.extend({ cols: z.number().int().min(20).max(400).optional(), rows: z.number().int().min(5).max(200).optional() }).parse(request.body);
  const current = terminalOfDraft(draftId);
  if (current) {
    if (current.ownerId !== body.ownerId) throw runnerError(404, "TERMINAL_NOT_FOUND", "没有可用的终端会话");
    return { terminalId: current.id, sessionFile: current.sessionFile };
  }
  const entry = await openSession(draftId, body.ownerId);
  const state = entry.session.snapshot();
  if (state.busy) {
    return { needsStop: true, state };
  }
  const sessionFile = entry.session.sessionFile;
  if (!sessionFile) throw new Error("当前会话还没有可接管的记录");
  const paths = draftPaths(draftId);
  await entry.session.releaseForTerminal();
  const terminal = await openTerminal({
    draftId, ownerId: body.ownerId, cwd: paths.workspace, sessionFile,
    agentDir: process.env.PI_AGENT_DIR || undefined,
    cols: body.cols, rows: body.rows,
    extensions: env.piTerminalExtensions.map((item) => resolve(process.cwd(), item)),
  });
  return { terminalId: terminal.id, sessionFile };
});

function ownedTerminal(id: string, ownerId: string) {
  const terminal = findTerminal(id);
  if (!terminal || terminal.ownerId !== ownerId) throw runnerError(404, "TERMINAL_NOT_FOUND", "没有可用的终端会话");
  return terminal;
}

app.get("/terminal/:id/events", async (request, reply) => {
  const { id } = z.object({ id: z.uuid() }).parse(request.params);
  const { ownerId, after = 0 } = refSchema.extend({ after: z.coerce.number().int().min(0).optional() }).parse(request.query);
  const terminal = ownedTerminal(id, ownerId);
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  for (const frame of terminal.frames.filter((item) => item.seq > after)) reply.raw.write(sseTerminalFrame(frame));
  const listener = (frame: { seq: number; at: number; data: string }) => reply.raw.write(sseTerminalFrame(frame));
  terminal.listeners.add(listener);
  const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
  request.raw.on("close", () => {
    clearInterval(heartbeat);
    terminal.listeners.delete(listener);
    reply.raw.end();
  });
});

app.post("/terminal/:id/input", async (request) => {
  const { id } = z.object({ id: z.uuid() }).parse(request.params);
  const { ownerId, data } = refSchema.extend({ data: z.string().max(20_000) }).parse(request.body);
  ownedTerminal(id, ownerId);
  return { ok: writeTerminal(id, data) };
});

app.post("/terminal/:id/resize", async (request) => {
  const { id } = z.object({ id: z.uuid() }).parse(request.params);
  const { ownerId, cols, rows } = refSchema.extend({ cols: z.number().int(), rows: z.number().int() }).parse(request.body);
  ownedTerminal(id, ownerId);
  return { ok: resizeTerminal(id, cols, rows) };
});

app.post("/terminal/:id/close", async (request) => {
  const { id } = z.object({ id: z.uuid() }).parse(request.params);
  const { ownerId } = refSchema.parse(request.body);
  const terminal = ownedTerminal(id, ownerId);
  const draftId = terminal.draftId;
  closeTerminal(id);
  if (draftId) {
    const entry = entryOf(draftId, ownerId);
    if (entry) await entry.session.reclaimFromTerminal(terminal.sessionFile);
  }
  return { ok: true };
});

app.post("/drafts/:draftId/terminal/status", async (request) => {
  const draftId = draftIdOf(request);
  const { ownerId } = refSchema.parse(request.body);
  const terminal = terminalOfDraft(draftId);
  if (terminal && terminal.ownerId !== ownerId) throw runnerError(404, "TERMINAL_NOT_FOUND", "没有可用的终端会话");
  return { open: Boolean(terminal && !terminal.exited), terminalId: terminal?.id ?? null };
});

app.delete("/drafts/:draftId", async (request) => {
  const draftId = draftIdOf(request);
  await closeSession(draftId);
  return { ok: true };
});

setInterval(() => void sweep().catch((error: unknown) => app.log.warn({ err: error }, "会话回收未完成")), 5 * 60_000).unref();

app.setErrorHandler((error: { statusCode?: number; code?: string; message: string }, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "请求参数不合法" });
  }
  if (error instanceof PiSessionBusy) {
    return reply.code(409).send({ code: error.kind === "handoff" ? "SESSION_HANDOFF" : "SESSION_BUSY", message: error.message });
  }
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  reply.code(status).send({ code: error.code ?? "PI_RUNNER_ERROR", message: error.message });
});

await app.listen({ port: env.piRunnerPort, host: env.piRunnerHost });
app.log.info(`Pi 运行器已启动：http://${env.piRunnerHost}:${env.piRunnerPort}`);
