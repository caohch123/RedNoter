import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer, connect } from "node:net";
import { setTimeout as wait } from "node:timers/promises";
import { mkdtemp, readdir, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

const database = new URL(process.env.DATABASE_URL);
const schema = "creation_readiness_" + randomBytes(6).toString("hex");
database.searchParams.set("schema", schema);
const db = new PrismaClient({ datasourceUrl: database.href });
const redis = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6380");
const upstreamRedis = redis.href;
const endpoint = { host: redis.hostname.replace(/^\[|\]$/g, ""), port: Number(redis.port || 6379) };
const queue = new Queue("zhaixing-creation", { prefix: schema, connection: {
  url: upstreamRedis, connectTimeout: 1500, commandTimeout: 1500, maxRetriesPerRequest: 0,
}, skipVersionCheck: true });
queue.on("error", () => {});
const sockets = new Set();
let disconnected = false;
const proxy = createServer((client) => {
  if (disconnected) { client.destroy(); return; }
  const upstream = connect(endpoint);
  const end = (socket, peer) => {
    sockets.delete(socket);
    peer.destroy();
  };
  for (const [socket, peer] of [[client, upstream], [upstream, client]]) {
    sockets.add(socket);
    socket.once("close", () => end(socket, peer));
    socket.on("error", () => socket.destroy());
  }
  client.pipe(upstream).pipe(client);
});
const account = createHttpServer((req, reply) => {
  if (req.headers.cookie !== "zx_session=readiness-test") return reply.writeHead(401).end();
  reply.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ user: { id: "readiness-test" } }));
});
const processes = [];
const logs = new Map();
const mediaDirectory = await mkdtemp(join(tmpdir(), "zhaixing-workspace-"));
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function until(operation, message) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result) return result;
    await wait(250);
  }
  assert.fail(message);
}

try {
  const accountPort = await listen(account);
  const proxyPort = await listen(proxy);
  const available = createServer();
  const port = await listen(available);
  await new Promise((resolve) => available.close(resolve));
  redis.hostname = "127.0.0.1";
  redis.port = String(proxyPort);
  const env = { ...process.env, DATABASE_URL: database.href, REDIS_URL: redis.href, MODEL_MODE: "demo",
    MEDIA_MODE: "local", MEDIA_DIRECTORY: mediaDirectory,
    ACCOUNT_ME_URL: "http://127.0.0.1:" + accountPort, CREATION_PORT: String(port), CREATION_HOST: "127.0.0.1",
    CREATION_QUEUE_PREFIX: schema };
  const service = (path) => {
    const child = spawn(process.execPath, ["--import", "tsx", path], { env, stdio: ["ignore", "pipe", "pipe"] });
    processes.push(child);
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => logs.set(stream, (logs.get(stream) ?? "") + chunk));
    }
    return child;
  };
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, encoding: "utf8" });
  assert.equal(migration.status, 0, migration.stderr);
  service("server/api.ts");
  const api = "http://127.0.0.1:" + port;
  const ready = async () => await fetch(api + "/health/ready").catch(() => null);
  await until(async () => (await fetch(api + "/health/live").catch(() => null))?.ok, "API 未启动");
  const emptyWorker = await until(async () => {
    const probe = await ready();
    if (probe?.status !== 503) return null;
    const body = await probe.json();
    return body.checks.redis && !body.checks.worker ? body : null;
  }, "Worker 未启动时应只报告 Worker 不可用");
  assert.deepEqual(emptyWorker.queue, { queued: 0, oldestQueuedMs: null });
  service("server/worker.ts");
  await until(async () => (await ready())?.ok, "Worker 未就绪");
  const base = api + "/v1/creation";
  async function call(path, method = "GET", body, status = 200) {
    const result = await fetch(base + path, { method, headers: { cookie: "zx_session=readiness-test",
      ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(result.status, status, await result.clone().text());
    return result.json();
  }
  const draft = await call("/drafts", "POST", { name: "就绪故障草稿" }, 201);
  const path = "/drafts/" + draft.id;
  const privateText = "保密正文 " + randomUUID();
  const data = { ...draft.data, settings: { ...draft.data.settings, topic: "就绪恢复", facts: privateText } };
  const before = await call(path, "PATCH", { revision: draft.revision, data });
  const submission = { requestId: randomUUID(), revision: before.revision, kind: "generate" };
  await queue.pause();
  const accepted = await call(path + "/runs", "POST", submission, 202);

  disconnected = true;
  for (const socket of sockets) socket.destroy();
  const unavailable = await until(async () => {
    const probe = await ready();
    if (probe?.status !== 503) return null;
    const body = await probe.json();
    return body.checks.redis ? null : body;
  }, "Redis 失联没有使就绪检查失败");
  assert.deepEqual(unavailable.checks, { postgres: true, redis: false, worker: false });
  assert.equal(unavailable.queue.queued, 1);
  assert.equal((await fetch(api + "/health/live")).status, 200);
  assert.equal((await call(path + "/runs", "POST", submission, 202)).id, accepted.id);
  const working = await call(path);
  const denied = await call(path + "/runs", "POST", { ...submission, requestId: randomUUID(), revision: working.revision }, 503);
  assert.equal(denied.code, "GENERATION_UNAVAILABLE");
  const manual = await call("/drafts", "POST", { name: "故障期间可手工编辑" }, 201);
  const manualPath = "/drafts/" + manual.id;
  const edited = await call(manualPath, "PATCH", { revision: manual.revision, data: { ...manual.data, body: "手工编辑保留" } });
  assert.ok((await call(manualPath + "/save", "POST", { revision: edited.revision })).savedAt);
  assert.equal((await call(manualPath)).data.body, "手工编辑保留");

  await queue.resume();
  disconnected = false;
  await until(async () => (await ready())?.ok, "Redis 恢复后生成未就绪");
  const done = await until(async () => {
    const run = await call("/runs/" + accepted.id);
    assert.notEqual(run.status, "failed", run.error);
    return run.status === "succeeded" ? run : null;
  }, "已受理任务没有在 Redis 恢复后完成");
  assert.ok(done.appliedRevision > before.revision);
  await until(() => [...logs.values()].some((chunk) => chunk.includes('"event":"generation.attempt"')), "缺少结构化任务日志");
  const lines = [...logs.values()].flatMap((chunk) => chunk.split(/\r?\n/g)).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const admission = lines.find((line) => line.event === "generation.accepted" && line.runId === accepted.id);
  const attempt = lines.find((line) => line.event === "generation.attempt" && line.runId === accepted.id && line.outcome === "completed");
  assert.ok(admission?.traceId && attempt?.jobId && Number.isInteger(attempt.elapsedMs));
  assert.ok(![...logs.values()].some((chunk) => chunk.includes(privateText) || chunk.includes("zx_session=readiness-test")));
  console.log("通过：Redis 断连和恢复、任务接收和重放、故障期间手工编辑");

  const other = await call("/drafts", "POST", { name: "另一篇草稿" }, 201);
  const workingNote = await call(path);
  const cookie = { cookie: "zx_session=readiness-test" };
  const upload = new FormData();
  upload.append("attachment", new File(["资料内容"], "参考.md"));
  const uploaded = await fetch(base + path + "/attachments", { method: "POST", headers: cookie, body: upload });
  assert.equal(uploaded.status, 201);
  const { id: attachmentId } = await uploaded.json();
  const registered = await call(path + "/workspace", "POST", { attachmentId }, 201);
  assert.equal((await call(path + "/workspace", "POST", { attachmentId }, 201)).fileId, registered.fileId);
  await call("/drafts/" + other.id + "/workspace", "POST", { attachmentId }, 404);
  const refUrl = (ref) => path + "/workspace/" + ref.fileId + "/versions/" + ref.versionId;
  assert.equal(await (await fetch(base + refUrl(registered), { headers: cookie })).text(), "资料内容");
  assert.equal((await fetch(base + refUrl(registered))).status, 401);
  assert.equal((await call(path + "/run-status")).workspaceVersion, 1);
  const completedRun = (id, status = "succeeded") => until(async () => {
    const run = await call("/runs/" + id);
    if (status !== "failed") assert.notEqual(run.status, "failed", run.error);
    return run.status === status ? run : null;
  }, "工作区任务没有完成");
  const submit = (revision, prompt, extra = {}) => call(path + "/runs", "POST", {
    revision, kind: "revise", prompt, requestId: randomUUID(), ...extra,
  }, 202);
  await queue.pause();
  const artifactRun = await submit(workingNote.revision, "把提纲保存为提纲.md", { workspace: [registered.fileId] });
  const manualChange = await call(path, "PATCH", { revision: workingNote.revision, data: { ...workingNote.data, title: "手工改过" } });
  await queue.resume();
  const published = (await completedRun(artifactRun.id)).result.publishedArtifacts[0];
  assert.equal(published.name, "提纲.md");
  assert.equal((await call(path)).revision, manualChange.revision);
  assert.equal((await call(path)).data.title, "手工改过");
  const update = await submit(manualChange.revision, "更新提纲.md 文件", { artifactTarget: published.fileId });
  const updated = (await completedRun(update.id)).result.publishedArtifacts[0];
  assert.equal(updated.fileId, published.fileId);
  assert.equal(updated.version, 2);
  const otherCopy = await submit(manualChange.revision, "把另一个提纲保存为提纲.md");
  assert.notEqual((await completedRun(otherCopy.id)).result.publishedArtifacts[0].fileId, published.fileId);
  await call(path + "/runs", "POST", { revision: manualChange.revision, kind: "revise", prompt: "更新提纲.md 文件", requestId: randomUUID() }, 400);
  const previousBytes = await (await fetch(base + refUrl(published) + "?download=1", { headers: cookie })).text();
  assert.match(previousBytes, /^# /);
  await call(path + "/plan", "POST", { enabled: true });
  const proposal = await submit(manualChange.revision, "保存计划版提纲为计划.md 工作区文件", { kind: "plan" });
  assert.equal((await completedRun(proposal.id)).result.plan[0].kind, "artifact");
  assert.equal((await call(path + "/workspace")).files.length, 3);
  const execution = await call(path + "/plan/execute", "POST", { revision: manualChange.revision, runId: proposal.id });
  assert.equal((await completedRun(execution.run.id)).result.publishedArtifacts.length, 1);
  assert.equal((await call(path + "/workspace")).files.length, 4);
  await queue.pause();
  const stale = await submit(manualChange.revision, "保存参考提纲为过期.md 工作区文件", { workspace: [registered.fileId] });
  assert.equal((await fetch(base + path + "/workspace/" + registered.fileId, { method: "DELETE", headers: cookie })).status, 204);
  await queue.resume();
  assert.equal((await completedRun(stale.id, "failed")).result.artifactConflict, true);
  assert.equal((await fetch(base + refUrl(registered), { headers: cookie })).status, 404);
  assert.equal((await fetch(base + "/attachments/" + attachmentId, { headers: cookie })).status, 200);
  console.log("通过：草稿工作区隔离、引用、独立产物、版本、计划审批及并发冲突");
} finally {
  await Promise.all(processes.map(async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  }));
  for (const socket of sockets) socket.destroy();
  proxy.close();
  account.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close().catch(() => undefined);
  await db.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE').catch(() => undefined);
  await db.$disconnect();
  await Promise.all((await readdir(mediaDirectory)).map((key) => unlink(join(mediaDirectory, key))));
  await rmdir(mediaDirectory);
}
