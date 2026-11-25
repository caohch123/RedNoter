import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as wait } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const database = new URL(process.env.DATABASE_URL);
database.searchParams.set("schema", "creation_test_" + randomBytes(6).toString("hex"));
const storage = await mkdtemp(join(tmpdir(), "zhaixing-test-"));
const prisma = new PrismaClient({ datasourceUrl: database.href });
const redis = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6380");
redis.pathname = "/7";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=", "base64");
const mp4 = Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex");
const submissions = [];
const tasks = new Map();
const heldReplies = new Map();
function holdReply(prompt) {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  heldReplies.set(prompt, pending);
  return () => { heldReplies.delete(prompt); release(); };
}
const generatedTitle = "Pi 已连接｜这是一个超过编辑器二十字限制的测试标题";
let repeatedQuestions = 0;
const fixture = createServer(async (req, res) => {
  const json = (value, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
  const parts = [];
  for await (const part of req) parts.push(part);
  const body = parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : undefined;
  const url = new URL(req.url, "http://local.test");
  if (url.pathname === "/account") {
    const id = req.headers.cookie?.split("=")[1];
    return id ? json({ user: { id } }) : json({}, 401);
  }
  if (url.pathname === "/compatible-mode/v1/chat/completions") {
    submissions.push({ path: url.pathname, auth: req.headers.authorization, body });
    const content = body.messages.at(-1).content;
    const prompt = JSON.stringify(body.messages);
    const text = typeof content === "string" ? content : content.find((part) => part.type === "text")?.text;
    let turn;
    try { turn = JSON.parse(text?.split("\n").at(-1) ?? ""); } catch {}
    const mediaMessage = turn?.messages?.at(-1)?.text;
    const toolResults = body.messages.filter(({ role }) => role === "tool");
    const toolNames = body.tools?.map(({ function: definition }) => definition.name) ?? [];
    const toolExample = prompt.includes("工具回归：");
    if (toolNames.includes("check_connection") || toolExample && toolNames.includes("search_workspace")) {
      const reply = (name, args) => ({ tool_calls: [{ index: 0, id: "local-" + toolResults.length, type: "function",
        function: { name, arguments: JSON.stringify(args) } }] });
      const parsed = toolResults.map(({ content: value }) => JSON.parse(value));
      let delta;
      if (toolNames.includes("check_connection")) delta = parsed.length
        ? { content: parsed[0].receipt } : reply("check_connection", { nonce: "star-check" });
      else if (!parsed.length) delta = reply("search_workspace", { query: "通勤规格" });
      else if (parsed.length === 1) delta = reply("read_workspace_file", { fileId: parsed[0][0].fileId, versionId: parsed[0][0].versionId });
      else if (parsed.length === 2) delta = reply("edit_note", { replace: { original: "这段等资料。", replacement: parsed[1].excerpt } });
      else if (parsed.length === 3) delta = reply("check_note", {});
      else delta = { content: JSON.stringify({ intent: "edit", message: "已按资料改稿。", sourceIds: [parsed[1].versionId] }) };
      const chunk = { id: "local-tools", object: "chat.completion.chunk", created: 1, model: body.model };
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant", ...delta }, finish_reason: null }] })}\n\n`);
      res.end(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: delta.tool_calls ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`);
      return;
    }
    const answer = JSON.stringify(content).includes("只回复 OK")
      ? "OK" : turn?.candidates
      ? JSON.stringify({ ids: turn.candidates.filter(({ name }) => name === "参考.md").map(({ versionId }) => versionId) })
      : turn?.prompt === "保存通勤肩带资料为工作区提纲.md"
      ? JSON.stringify({ intent: "reply", message: "提纲已整理。", sourceIds: turn.workspaceTexts.map(({ versionId }) => versionId),
        artifacts: [{ name: "提纲.md", markdown: "# 通勤肩带\n\n- 肩带加厚" }] })
      : prompt.includes("媒体创作助手")
      ? mediaMessage?.includes("模拟整理失败") ? "invalid JSON" : JSON.stringify(prompt.includes("蓝色") ? { prompt: "蓝色背景，静物特写，光线柔和" } : {
        question: "希望采用什么画面风格？",
        options: ["自然光", "胶片质感", "简约留白"].map((title) => ({ title, summary: `${title}的通勤场景`, prompt: `${title}，通勤包细节特写` })),
      })
      : turn?.input?.creativeTask ? (() => {
        const task = turn.input.creativeTask;
        if (task.request.includes("模拟反复追问") && repeatedQuestions++ < 2) {
          return JSON.stringify({ intent: "reply", message: "还想写什么主题？" });
        }
        const coverPrompt = `${task.topic}，简洁封面，自然光和留白`;
        return turn.kind === "plan" ? JSON.stringify({ intent: "plan", message: "可以执行这份计划。",
          plan: [{ kind: "write", instruction: task.topic }, ...(task.cover ? [{ kind: "cover", instruction: coverPrompt }] : [])] })
          : JSON.stringify({ intent: "edit", message: "文案已准备好。", coverPrompt,
            ...(!task.media?.length && task.topic.includes("RAG") ? {
              media: [{ kind: "image", source: "suggested", prompt: "RAG 检索、增强、生成的流程图" }],
            } : {}),
            patch: { title: task.topic, body: `这篇笔记围绕${task.topic}，以通勤场景说明选购要点。`, tags: ["真实分享"] } });
      })()
      : ["占位词测试", "未判明用途失败"].includes(turn?.prompt) ? JSON.stringify({ intent: "reply", message: "自然回复或一个简短追问" })
      : turn?.prompt === "把标题换成星光通勤" ? JSON.stringify({ intent: "edit", message: "标题已换好。", patch: { title: "星光通勤" } })
      : turn?.prompt === "你怎么看标题？" ? JSON.stringify({ intent: "reply", message: "可以把场景写得更具体。" })
      : turn?.kind === "plan" ? JSON.stringify({ intent: "plan", message: "好呀！先定文案，再做封面。",
        plan: [{ kind: "write", instruction: "把标题改成星光通勤" }, { kind: "cover", instruction: "米白底下的通勤包" }] })
      : turn?.input?.planExecution ? JSON.stringify({ intent: "edit", message: "已整理", patch: { title: "星光通勤" } })
      : turn?.prompt === "聊聊围棋" ? JSON.stringify({ intent: "outside", message: "落子要兼顾全局。".repeat(30), patch: { title: "围棋" } })
      : turn?.prompt === "请参考当前附件" ? JSON.stringify({ intent: "reply", message: "附件已读。" })
      : JSON.stringify({ message: " ", ...(body.model === "qwen-test" ? { analysis: [] } : {}),
        patch: { title: generatedTitle, body: "这是兼容接口返回的笔记。", tags: ["#联调#", " ", "联调"] } });
    if (turn?.input?.creativeTask?.request.includes("延迟返回")) await wait(1400);
    await heldReplies.get(turn?.prompt ?? mediaMessage);
    const chunk = { id: "local", object: "chat.completion.chunk", created: 1, model: body.model };
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] })}\n\n`);
    res.end(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
    return;
  }
  if (url.pathname === "/api/v1/models") return json({ output: { models: [{ model_id: "wan2.7-image" }] } });
  if (url.pathname.endsWith("/generation") || url.pathname.endsWith("/video-synthesis")) {
    const id = randomUUID();
    const prompt = body.input.prompt ?? body.input.messages[0].content[0].text;
    submissions.push({ path: url.pathname, auth: req.headers.authorization, body });
    assert.equal(req.headers["x-dashscope-async"], "enable");
    if (prompt.includes("拒绝测试")) return json({ code: "Model.AccessDenied", request_id: "refused-request" }, 403);
    if (prompt.includes("未知测试")) return json({}, 504);
    tasks.set(id, { model: body.model, failPoll: prompt.includes("续查测试") });
    return json({ output: { task_id: id, task_status: "PENDING" } });
  }
  if (url.pathname.startsWith("/api/v1/tasks/")) {
    const task = tasks.get(url.pathname.split("/").at(-1));
    if (!task) return json({}, 404);
    submissions.push({ path: url.pathname, auth: req.headers.authorization });
    if (task.failPoll) return json({ request_id: "poll-request" }, 503);
    return json({ output: { task_status: "SUCCEEDED", ...(task.model.includes("image")
      ? { choices: [{ message: { content: [{ image: `${origin}/result.png` }] } }] }
      : { video_url: `${origin}/result.mp4` }) } });
  }
  if (url.pathname === "/result.png") return res.end(png);
  if (url.pathname === "/result.mp4") return res.end(mp4);
  if (url.pathname === "/v1/topics/references") return json({ items: [{ id: "reference", title: "带入的参考", body: "参考内容", tags: ["场景"] }], nextCursor: null });
  if (url.pathname === "/v1/topics/references/reference") return json({ id: "reference", title: "带入的参考", body: "参考内容" });
  if (url.pathname === "/v1/assets/example") return json({ id: "example", type: "text", content: { text: "已授权素材" } });
  return json({}, 404);
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${fixture.address().port}`;
const serverPort = 3072;
const base = `http://127.0.0.1:${serverPort}/v1/creation`;
const token = "test-publisher-token";
const env = { ...process.env,
  DATABASE_URL: database.href, REDIS_URL: redis.href, ACCOUNT_ME_URL: `${origin}/account`, CREATION_PORT: String(serverPort),
  CREATION_QUEUE_PREFIX: database.searchParams.get("schema"),
  MODEL_MODE: "demo", MEDIA_MODE: "local", MEDIA_DIRECTORY: storage, PUBLISH_READ_TOKEN: token,
  CREATION_MODEL_ADMIN_IDS: "admin", CREATION_MODEL_CONFIG_KEY: randomBytes(32).toString("hex"),
  CREATION_MODEL_ORIGINS: origin, CREATION_MEDIA_RESULT_ORIGINS: origin,
  TOPICS_API_URL: origin, ASSETS_API_URL: origin,
};
const processes = [];
function service(path) {
  const child = spawn(process.execPath, ["--import", "tsx", path], { env, stdio: "ignore" });
  processes.push(child);
  return child;
}
async function request(path, { method = "GET", body, id = "writer", status = 200, headers = {}, raw = false } = {}) {
  const response = await fetch(base + path, {
    method, headers: { cookie: `zx_session=${id}`, ...headers, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  assert.ok([status].flat().includes(response.status), method + " " + path + " HTTP " + response.status + ": " + await response.clone().text());
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}
async function until(check, timeout = 70000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await wait(300);
  }
  assert.fail("等待测试状态超时");
}
const model = (kind, provider, modelId, apiKey, credentialFrom) => request(`/admin/models/${kind}`, { method: "PUT", id: "admin", body: {
  provider, modelId, apiKey, credentialFrom, baseUrl: origin + (["text", "vision"].includes(kind) ? "/compatible-mode/v1" : "/api/v1"),
} });
const apply = (run, draft) => request(`/runs/${run.id}/apply`, { method: "POST", body: { revision: draft.revision } });
const complete = (run) => until(async () => {
  const result = await request(`/runs/${run.id}`);
  assert.notEqual(result.status, "failed", result.error);
  return result.status === "succeeded" ? result : null;
});
const quickCover = (draft, id, status = 202) => request(`/drafts/${draft.id}/media-runs`, {
  method: "POST", status, body: { kind: "cover", revision: draft.revision, requestId: id },
});
const prepare = (draft, options, status = 202) => request(`/drafts/${draft.id}/media-brief`, {
  method: "POST", status, body: { revision: draft.revision, requestId: randomUUID(), ...options },
});
const talk = async (draft, options) => {
  const response = await prepare(draft, options, [200, 202]);
  if (response.run?.kind !== "media-prepare") return response;
  const run = await complete(response.run);
  assert.equal(run.result.preparation.state, "applied");
  return { ...response, brief: run.result.preparation.brief, run: null };
};
const confirm = (draft, brief, options = {}, status = 202) => request(`/drafts/${draft.id}/media-brief/confirm`, {
  method: "POST", status, body: { revision: draft.revision, briefId: brief.id, version: brief.version, prompt: brief.prompt, ...options },
});
const mediaCalls = () => submissions.filter(({ path }) => path.endsWith("/generation") || path.endsWith("/video-synthesis"));
const readiness = () => fetch(`http://127.0.0.1:${serverPort}/health/ready`);
const assertReady = () => until(async () => (await readiness().catch(() => null))?.ok);
const failed = (run) => until(async () => {
  const result = await request(`/runs/${run.id}`);
  assert.notEqual(result.status, "succeeded");
  return result.status === "failed" ? result : null;
});
try {
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, encoding: "utf8" });
  assert.equal(migration.status, 0, migration.stderr);
  service("server/api.ts");
  await until(async () => (await fetch(`http://127.0.0.1:${serverPort}/health`).catch(() => null))?.ok);
  let worker = service("server/worker.ts");
  await assertReady();
  await request("/admin/models", { status: 403 });
  const original = await model("text", "openai-compatible", "qwen-test", "local-text-secret");
  assert.ok(!JSON.stringify(original).includes("local-text-secret"));
  assert.notEqual((await prisma.modelProfile.findUniqueOrThrow({ where: { id: original.id } })).encryptedKey, "local-text-secret");
  await request("/admin/models/text/test", { method: "POST", id: "admin" });
  await model("cover", "bailian", "wan2.7-image", "local-image-secret");
  await model("textToVideo", "bailian", "wan2.7-t2v", undefined, "cover");
  await model("imageToVideo", "bailian", "wan2.7-i2v", undefined, "cover");
  await request("/admin/models/cover/test", { method: "POST", id: "admin" });
  assert.deepEqual((await request("/config")).active, { text: true, cover: true, textToVideo: true, imageToVideo: true, vision: false });
  assert.equal((await request("/sources/references?keyword=通勤")).items[0].id, "reference");
  assert.equal((await request("/sources/references/reference")).title, "带入的参考");
  const blank = await request("/drafts", { status: 201, method: "POST", body: {} });
  await quickCover(blank, randomUUID(), 400);
  let draft = await request("/drafts", { status: 201, method: "POST", body: { example: true } });
  assert.equal((await request(`/drafts/${draft.id}/import-asset`, { method: "POST", body: { assetId: "example" } })).text, "已授权素材");
  const textRun = await request(`/drafts/${draft.id}/runs`, { method: "POST", status: 202,
    body: { kind: "generate", revision: draft.revision, requestId: randomUUID() } });
  await model("text", "openai-compatible", "qwen-replacement", "local-rotation-secret");
  const { result: textResult } = await complete(textRun);
  assert.equal(textResult.patch.title, Array.from(generatedTitle).slice(0, 20).join(""));
  assert.deepEqual(textResult.patch.tags, ["联调"]);
  assert.equal(textResult.message, "初稿已准备好。");
  assert.equal(submissions[1].body.model, "qwen-test");
  draft = await apply(textRun, draft);
  const noAnalysisRun = await request(`/drafts/${draft.id}/runs`, { method: "POST", status: 202,
    body: { kind: "generate", revision: draft.revision, requestId: randomUUID() } });
  const { result: noAnalysis } = await complete(noAnalysisRun);
  assert.equal(noAnalysis.analysis, undefined);
  assert.equal(noAnalysis.patch.body, textResult.patch.body);
  const requestId = randomUUID();
  const coverRun = await quickCover(draft, requestId);
  assert.equal((await quickCover(draft, requestId)).id, coverRun.id);
  await until(async () => (await prisma.run.findUnique({ where: { id: coverRun.id } })).nextPollAt);
  await wait(450);
  worker.kill();
  await model("cover", "bailian", "wan2.7-image", "new-cover-secret");
  worker = service("server/worker.ts");
  await complete(coverRun);
  assert.equal(submissions.filter((entry) => entry.path.endsWith("/generation")).length, 1);
  const quickPrompt = mediaCalls()[0].body.input.messages[0].content[0].text;
  assert.ok(quickPrompt.includes(draft.data.title) && quickPrompt.includes(draft.data.body));
  assert.equal(submissions.find((entry) => entry.path.includes("/tasks/")).auth, "Bearer local-image-secret");
  draft = await apply(coverRun, draft);
  assert.deepEqual(await request(`/media/${draft.data.coverId}`, { raw: true }), png);
  assert.equal((await talk(draft, { message: "怎样生成视频？" })).matched, false);
  const beforeImage = mediaCalls().length;
  const { brief: pending } = await talk(draft, { kind: "image" });
  assert.equal(pending.prompt, null);
  assert.equal(pending.options.length, 3);
  assert.equal(pending.options[1].title, "胶片质感");
  for (const [prompt, expected] of [["你好", "你好"], ["帮我改一下", "想先改哪一部分"]]) {
    assert.equal((await talk(draft, { message: prompt, fromComposer: true })).matched, false);
    const chat = await request(`/drafts/${draft.id}/runs`, { method: "POST", status: 202,
      body: { kind: "revise", revision: draft.revision, requestId: randomUUID(), prompt } });
    const { result } = await complete(chat);
    assert.ok(result.message.includes(expected));
    assert.equal(result.patch, undefined);
  }
  const switchPrompt = await talk(draft, { kind: "video", fromComposer: true });
  assert.equal(switchPrompt.switchTo, "video");
  assert.equal(switchPrompt.brief.id, pending.id);
  assert.equal((await request(`/drafts/${draft.id}`)).brief.id, pending.id);
  const { brief: image } = await talk(draft, { message: "蓝色背景", answer: { briefId: pending.id, version: pending.version } });
  assert.equal(mediaCalls().length, beforeImage);
  await confirm(draft, pending, { prompt: image.prompt }, 409);
  const [imageRun, duplicate] = await Promise.all([confirm(draft, image), confirm(draft, image)]);
  assert.equal(imageRun.id, duplicate.id);
  await complete(imageRun);
  assert.equal(mediaCalls().length, beforeImage + 1);
  draft = await apply(imageRun, draft);
  const [imageId] = draft.data.imageIds;
  assert.ok(imageId);
  const { brief: video } = await talk(draft, { message: "生成蓝色背景的视频" });
  const videoRun = await confirm(draft, video, { ratio: "9:16", duration: 5 });
  const { brief: frame } = await talk(draft, { message: "生成蓝色背景的视频" });
  await confirm(draft, frame, { sourceCoverId: randomUUID() }, 400);
  const frameRun = await confirm(draft, frame, { sourceCoverId: draft.data.coverId, duration: 10 });
  assert.equal((await request(`/runs/${imageRun.id}`)).mediaMessages.at(-2).text, "蓝色背景");
  await Promise.all([complete(videoRun), complete(frameRun)]);
  const videoCalls = submissions.filter((entry) => entry.path.endsWith("/video-synthesis"));
  assert.ok(videoCalls.some(({ body }) => body.parameters.ratio === "9:16"));
  assert.ok(videoCalls.some(({ body }) => body.input.media?.[0]?.type === "first_frame" && body.input.media[0].url.startsWith("data:image/png;")));
  draft = await apply(frameRun, draft);
  assert.deepEqual(await request(`/media/${draft.data.videoId}`, { raw: true, status: 206, headers: { range: "bytes=4-7" } }), Buffer.from("ftyp"));
  await request(`/media/${draft.data.videoId}`, { id: "other", status: 404 });
  const finalize = (body, status = 201) => request(`/drafts/${draft.id}/finalizations`, { method: "POST", status, body });
  await finalize({ revision: draft.revision }, 400);
  const imageFinal = await finalize({ revision: draft.revision, noteKind: "image" });
  assert.deepEqual(imageFinal.imageIds, [imageId]);
  assert.equal(imageFinal.videoId, null);
  const imagePath = `/finalizations/${imageFinal.finalizationId}/images/${imageId}`;
  await request(imagePath, { status: 401 });
  assert.deepEqual(await request(imagePath, { raw: true, headers: { authorization: `Bearer ${token}` } }), png);
  assert.equal((await finalize({ revision: draft.revision, noteKind: "image" }, 200)).finalizationId, imageFinal.finalizationId);
  draft = await request(`/drafts/${draft.id}`);
  const final = await finalize({ revision: draft.revision, noteKind: "video" });
  assert.equal(final.noteKind, "video");
  assert.deepEqual(final.imageIds, []);
  assert.deepEqual(await request(`/finalizations/${final.finalizationId}/video`, { raw: true, headers: { authorization: `Bearer ${token}` } }), mp4);
  draft = await request(`/drafts/${draft.id}`);
  const beforeCustom = mediaCalls().length;
  const { brief: custom, run: beforeConfirmation } = await talk(draft, { message: "请你生成蓝色背景的封面" });
  assert.equal(beforeConfirmation, null);
  assert.equal(mediaCalls().length, beforeCustom);
  const customRun = await confirm(draft, custom);
  assert.equal(customRun.kind, "cover");
  assert.equal(custom.id, customRun.id);
  await complete(customRun);
  const { brief: photo } = await talk(draft, { kind: "image", fromComposer: true });
  const { brief: replacement } = await talk(draft, { kind: "video", fromComposer: true,
    replace: { briefId: photo.id, version: photo.version } });
  assert.equal(replacement.kind, "video");
  assert.notEqual(replacement.id, photo.id);
  const beforeChoice = mediaCalls().length;
  const { brief: optionSelected } = await talk(draft, { answer: { briefId: replacement.id, version: replacement.version, choice: 1 } });
  assert.equal(optionSelected.prompt, "胶片质感，通勤包细节特写");
  assert.equal(mediaCalls().length, beforeChoice);
  await request(`/drafts/${draft.id}/media-brief/cancel`, { method: "POST", status: 204, raw: true,
    body: { briefId: optionSelected.id, version: optionSelected.version } });

  let asyncDraft = await request("/drafts", { status: 201, method: "POST", body: { example: true } });
  const asyncPath = `/drafts/${asyncDraft.id}`;
  const beforePreparation = mediaCalls().length;
  const delayedMedia = "生成蓝色背景的封面，保留产品细节";
  const releasePreparation = holdReply(delayedMedia);
  const idempotencyKey = randomUUID();
  let currentBrief;
  try {
    const response = await prepare(asyncDraft, { message: delayedMedia, requestId: idempotencyKey });
    const row = response.run;
    assert.equal(row.kind, "media-prepare");
    assert.equal(response.brief, null);
    const duplicate = await prepare(asyncDraft, { message: delayedMedia, requestId: idempotencyKey });
    assert.equal(duplicate.run.id, row.id);
    assert.equal((await prepare(asyncDraft, { message: delayedMedia + "。", requestId: idempotencyKey }, 409)).code, "REQUEST_ID_CONFLICT");
    const missingId = randomUUID();
    const progress = await request(`${asyncPath}/run-status?ids=${row.id},${missingId}`);
    assert.ok(progress.runs.some(({ id, status }) => id === row.id && ["queued", "running"].includes(status)));
    assert.deepEqual(progress.missing, [missingId]);
    await request(`${asyncPath}/run-status`, { id: "other", status: 404 });
    const untouched = await request(asyncPath);
    assert.ok(untouched.runs.some(({ id }) => id === row.id));
    assert.equal((await prepare(asyncDraft, { kind: "video" }, 409)).code, "MEDIA_PREPARATION_IN_PROGRESS");
    asyncDraft = await request(asyncPath, { method: "PATCH", body: {
      revision: asyncDraft.revision, data: { ...asyncDraft.data, title: "更新后的通勤主题" },
    } });
    releasePreparation();
    const oldProposal = (await complete(row)).result.preparation;
    assert.equal(oldProposal.state, "stale");
    assert.equal(oldProposal.brief.stale, true);
    assert.equal(submissions.filter(({ body }) => body && JSON.stringify(body).includes(delayedMedia)).length, 1);
    assert.equal((await request(asyncPath)).brief, null);
    await confirm(asyncDraft, oldProposal.brief, {}, 409);
    const retried = (await prepare(asyncDraft, { retryOf: row.id })).run;
    const preparation = (await complete(retried)).result.preparation;
    assert.equal(preparation.state, "applied");
    assert.ok(submissions.some(({ body }) => body && JSON.stringify(body).includes("更新后的通勤主题") &&
      JSON.stringify(body).includes(delayedMedia)));
    currentBrief = preparation.brief;
  } finally {
    releasePreparation();
  }
  const cancelMessage = "生成蓝色背景的视频，测试取消整理";
  const releaseCancellation = holdReply(cancelMessage);
  try {
    const { run: pendingCancel } = await prepare(asyncDraft, {
      fromComposer: true, kind: "video", message: cancelMessage,
      replace: { briefId: currentBrief.id, version: currentBrief.version },
    });
    assert.equal((await request(asyncPath)).brief.id, currentBrief.id);
    await until(async () => (await request(`/runs/${pendingCancel.id}`)).status === "running");
    await request(`${asyncPath}/media-brief/preparations/${pendingCancel.id}/cancel`, { method: "POST", status: 204, raw: true });
    releaseCancellation();
    assert.equal((await request(`/runs/${pendingCancel.id}`)).status, "cancelled");
    assert.equal((await request(asyncPath)).brief.id, currentBrief.id);
  } finally {
    releaseCancellation();
  }
  const { run: failPreparation } = await prepare(asyncDraft, {
    fromComposer: true, kind: "video", message: "生成蓝色背景的视频，模拟整理失败",
    replace: { briefId: currentBrief.id, version: currentBrief.version },
  });
  await failed(failPreparation);
  assert.equal((await request(asyncPath)).brief.id, currentBrief.id);
  asyncDraft = await request(asyncPath, { method: "PATCH", body: {
    revision: asyncDraft.revision, data: { ...asyncDraft.data, body: "这里是新的正文" },
  } });
  assert.equal((await request(asyncPath)).brief.stale, true);
  assert.equal((await request(asyncPath + "/run-status")).briefStale, true);
  assert.equal((await confirm(asyncDraft, currentBrief, {}, 409)).code, "MEDIA_BRIEF_STALE");
  const { run: refreshTask } = await prepare(asyncDraft, { refresh: { briefId: currentBrief.id, version: currentBrief.version } });
  const refreshed = (await complete(refreshTask)).result.preparation.brief;
  assert.equal(refreshed.stale, false);
  assert.equal(mediaCalls().length, beforePreparation);
  const [oneCommit, sameCommit] = await Promise.all([confirm(asyncDraft, refreshed), confirm(asyncDraft, refreshed)]);
  assert.equal(oneCommit.id, sameCommit.id);
  await complete(oneCommit);
  assert.equal(mediaCalls().length, beforePreparation + 1);

  const prepQueue = new Queue("zhaixing-creation", {
    prefix: env.CREATION_QUEUE_PREFIX,
    connection: {
      host: redis.hostname, port: Number(redis.port || 6379), db: 7,
      username: decodeURIComponent(redis.username) || undefined,
      password: decodeURIComponent(redis.password) || undefined,
      ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
    },
  });
  try {
    await prepQueue.pause();
    const restartNote = await request("/drafts", { status: 201, method: "POST", body: { example: true } });
    const restartInput = { message: "生成蓝色背景的封面，等待 Worker 恢复", requestId: randomUUID() };
    const { run: accepted } = await prepare(restartNote, restartInput);
    assert.equal((await request(`/runs/${accepted.id}`)).status, "queued");
    worker.kill();
    await until(async () => (await readiness()).status === 503);
    assert.equal((await prepare(restartNote, restartInput)).run.id, accepted.id);
    await prepQueue.resume();
    worker = service("server/worker.ts");
    await assertReady();
    assert.equal((await complete(accepted)).result.preparation.state, "applied");
    assert.equal(mediaCalls().length, beforePreparation + 1);
  } finally {
    await prepQueue.resume();
    await prepQueue.close();
  }

  for (const [prompt, stage, status] of [["拒绝测试", "rejected", 403], ["未知测试", "unknown", 504], ["续查测试", "poll", 503]]) {
    draft = await request(`/drafts/${draft.id}`);
    const { brief } = await talk(draft, { message: "生成蓝色背景的配图" });
    const rejected = await confirm(draft, brief, { prompt });
    const result = await failed(rejected);
    assert.equal(result.failureDetail.stage, stage);
    assert.equal(result.failureDetail.status, status);
    assert.equal(mediaCalls().filter(({ body }) => body.input.messages?.[0].content[0].text === prompt).length, 1);
    if (stage === "poll") {
      for (const task of tasks.values()) task.failPoll = false;
      await request(`/runs/${rejected.id}/resume`, { method: "POST" });
      await complete(rejected);
      assert.equal(mediaCalls().filter(({ body }) => body.input.messages?.[0].content[0].text === prompt).length, 1);
    } else {
      await request(`/runs/${rejected.id}/resume`, { method: "POST", status: 400 });
    }
  }
  let starDraft = await request("/drafts", { method: "POST", status: 201 });
  const starPath = `/drafts/${starDraft.id}`;
  const starTurn = (kind, prompt, attachments = [], status = 202) => request(starPath + "/runs", { method: "POST", status,
    body: { kind, prompt, attachments, revision: starDraft.revision, requestId: randomUUID() } });
  const profilelessImage = new FormData();
  profilelessImage.append("attachment", new Blob([png], { type: "image/png" }), "sample.png");
  const chatPhoto = await request(starPath + "/attachments", { method: "POST", status: 201, body: profilelessImage });
  await starTurn("revise", "", [chatPhoto.id], 400);
  await request(`/attachments/${chatPhoto.id}`, { id: "other", status: 404 });
  await model("vision", "openai-compatible", "vision-test", "local-vision-secret");
  await complete(await starTurn("revise", "", [chatPhoto.id]));
  assert.ok(submissions.some(({ body }) => body?.model === "vision-test" && JSON.stringify(body.messages).includes("data:image/png;base64,")));
  const notes = new FormData();
  notes.append("attachment", new Blob(["通勤资料：肩带加厚"]), "参考.md");
  const memo = await request(starPath + "/attachments", { method: "POST", status: 201, body: notes });
  const source = await request(starPath + "/workspace", { method: "POST", status: 201, body: { attachmentId: memo.id } });
  const unrelated = new FormData();
  unrelated.append("attachment", new Blob(["通勤路线：步行十分钟"]), "路线.md");
  const route = await request(starPath + "/attachments", { method: "POST", status: 201, body: unrelated });
  await request(starPath + "/workspace", { method: "POST", status: 201, body: { attachmentId: route.id } });
  const workspaceResult = await complete(await starTurn("revise", "保存通勤肩带资料为工作区提纲.md"));
  assert.deepEqual(workspaceResult.result.sources, [source]);
  assert.equal(workspaceResult.result.publishedArtifacts[0].name, "提纲.md");
  const selectRequest = submissions.find(({ body }) => body?.messages && JSON.stringify(body.messages).includes("candidates") &&
    JSON.stringify(body.messages).includes("路线.md"));
  const artifactRequest = submissions.find(({ body }) => body?.messages && JSON.stringify(body.messages).includes("workspaceTexts") &&
    JSON.stringify(body.messages).includes("肩带加厚"));
  assert.ok(selectRequest && artifactRequest);
  assert.ok(!JSON.stringify(artifactRequest.body.messages).includes("步行十分钟"));
  assert.equal((await complete(await starTurn("revise", "你是谁"))).result.message.includes("star"), true);
  const offTopic = (await complete(await starTurn("revise", "聊聊围棋"))).result;
  assert.equal(offTopic.patch, undefined);
  assert.ok(offTopic.message.endsWith("请继续我们的创作之旅吧") && Array.from(offTopic.message).length <= 100);
  await request(starPath + "/plan", { method: "POST", body: { enabled: true } });
  const proposal = await complete(await starTurn("plan", "先改标题，再做封面", [memo.id]));
  assert.deepEqual(proposal.result.plan.map(({ kind }) => kind), ["write", "cover"]);
  assert.equal(proposal.result.patch, undefined);
  assert.ok(submissions.some(({ body }) => body && JSON.stringify(body).includes("肩带加厚")));
  assert.equal((await request(starPath)).planning.latestRunId, proposal.id);
  const beforePlanMedia = mediaCalls().length;
  const approval = { revision: starDraft.revision, runId: proposal.id };
  const approved = await request(starPath + "/plan/execute", { method: "POST", body: approval });
  assert.equal((await request(starPath + "/plan/execute", { method: "POST", body: approval })).run.id, approved.run.id);
  assert.deepEqual((await complete(approved.run)).result.changed, ["title"]);
  starDraft = await request(starPath);
  assert.equal(starDraft.data.title, "星光通勤");
  const { brief: readyCover } = await request(starPath + "/plan/media", { method: "POST", body: { stepId: starDraft.planning.media[0].id } });
  assert.equal(mediaCalls().length, beforePlanMedia);
  await complete(await confirm(starDraft, readyCover));
  assert.equal((await request(starPath)).planning.enabled, false);
  const blankDraft = () => request("/drafts", { method: "POST", status: 201 });
  const createTurn = (draft, prompt, options = {}) => request(`/drafts/${draft.id}/runs`, { method: "POST", status: 202,
    body: { kind: "revise", prompt, revision: draft.revision, requestId: randomUUID(), ...options } });
  const coverFor = (draft, run, status = 200) => request(`/runs/${run.id}/cover-brief`, { method: "POST", status,
    body: { revision: draft.revision } });
  const originalRequest = "帮我生成耳机推荐的广告笔记，要求封面图片和文案都要有";
  let mixedDraft = await blankDraft();
  assert.equal((await talk(mixedDraft, { fromComposer: true, message: originalRequest })).matched, false);
  const initialCreative = await complete(await createTurn(mixedDraft, originalRequest));
  assert.match(initialCreative.result.patch.title, /耳机/);
  mixedDraft = await request(`/drafts/${mixedDraft.id}`);
  const creative = await complete(await createTurn(mixedDraft, "随机选择"));
  assert.match(creative.result.patch.body, /耳机/);
  assert.match(creative.result.media[0].prompt, /耳机/);
  mixedDraft = await request(`/drafts/${mixedDraft.id}`);
  assert.equal(mixedDraft.revision, creative.appliedRevision);
  const beforeMixed = mediaCalls().length;
  const { brief: existingMedia } = await talk(mixedDraft, { kind: "image", fromComposer: true });
  const blocked = await coverFor(mixedDraft, creative);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.brief.id, existingMedia.id);
  await request(`/drafts/${mixedDraft.id}/media-brief/cancel`, { method: "POST", status: 204, raw: true,
    body: { briefId: existingMedia.id, version: existingMedia.version } });
  const { brief: mixedCover } = await coverFor(mixedDraft, creative);
  assert.equal(mixedCover.confirmationOnly, true);
  const reopened = await request(`/drafts/${mixedDraft.id}`);
  assert.equal(reopened.brief.id, (await coverFor(mixedDraft, creative)).brief.id);
  assert.equal(mediaCalls().length, beforeMixed);
  const [paid, duplicatePaid] = await Promise.all([confirm(mixedDraft, mixedCover), confirm(mixedDraft, mixedCover)]);
  assert.equal(paid.id, duplicatePaid.id);
  await complete(paid);
  assert.equal(mediaCalls().length, beforeMixed + 1);
  assert.equal((await coverFor(mixedDraft, creative)).submitted, true);

  const rag = await blankDraft();
  const mediaBeforeRag = mediaCalls().length;
  const multi = await complete(await createTurn(rag, "写一篇讲清RAG的笔记，生成两张流程配图和一段视频"));
  const ragWorking = await request(`/drafts/${rag.id}`);
  assert.equal(ragWorking.data.body, multi.result.patch.body);
  assert.equal(ragWorking.savedAt, null);
  assert.deepEqual(multi.result.media.map((entry) => entry.kind), ["image", "image", "video"]);
  const openProposal = ({ id }) => request(`/runs/${multi.id}/media-proposal`, { method: "POST",
    body: { revision: ragWorking.revision, proposalId: id } });
  const { brief: firstImage } = await openProposal(multi.result.media[0]);
  assert.equal((await openProposal(multi.result.media[2])).blocked, true);
  assert.equal(mediaCalls().length, mediaBeforeRag);
  const [ragImage, sameImage] = await Promise.all([confirm(ragWorking, firstImage), confirm(ragWorking, firstImage)]);
  assert.equal(ragImage.id, sameImage.id);
  const { brief: nextVideo } = await openProposal(multi.result.media[2]);
  assert.equal(nextVideo.kind, "video");
  assert.equal((await confirm(ragWorking, firstImage)).id, ragImage.id);
  await complete(ragImage);
  assert.equal(mediaCalls().length, mediaBeforeRag + 1);
  assert.equal((await request(`/drafts/${rag.id}`)).data.imageIds.length, 0);
  assert.equal((await apply(ragImage, ragWorking)).data.imageIds.length, 1);
  const suggestion = await complete(await createTurn(await blankDraft(), "写一篇讲清RAG的笔记"));
  assert.deepEqual(suggestion.result.media.map(({ kind, source }) => [kind, source]), [["image", "suggested"]]);
  const textOnly = await complete(await createTurn(await blankDraft(), "写一篇讲清RAG的笔记，不用配图和视频"));
  assert.equal(textOnly.result.media, undefined);

  const legacy = await blankDraft();
  const old = await prisma.run.create({ data: { id: randomUUID(), draftId: legacy.id, baseRevision: legacy.revision, kind: "revise", status: "succeeded", prompt: originalRequest,
    input: { draft: legacy.data, history: [] }, result: { message: "自然回复或一个简短追问" } } });
  const legacyDetails = await request(`/drafts/${legacy.id}`);
  assert.equal(legacyDetails.runs[0].prompt, originalRequest);
  assert.equal(legacyDetails.runs[0].hiddenReply, true);
  assert.equal(legacyDetails.runs[0].result, null);
  const recovered = await complete(await createTurn(legacy, "你看着办"));
  const persisted = await prisma.run.findUnique({ where: { id: recovered.id } });
  assert.match(recovered.result.patch.title, /耳机/);
  assert.ok(persisted.input.history.some((turn) => turn.request === old.prompt && turn.response === ""));
  assert.equal(JSON.stringify(persisted.input).includes("自然回复或一个简短追问"), false);
  await failed(await createTurn(await request(`/drafts/${legacy.id}`), "占位词测试"));

  const pendingDraft = await blankDraft();
  const question = await complete(await createTurn(pendingDraft, "帮我写一篇小红书笔记"));
  assert.equal(question.result.clarification, true);
  const clarified = await complete(await createTurn(pendingDraft, "学生党的桌面收纳"));
  assert.match(clarified.result.patch.body, /桌面收纳/);
  const standalone = await complete(await createTurn(await blankDraft(), "随机选择"));
  assert.ok(standalone.result.patch.title && standalone.result.patch.body);
  const planDraft = await blankDraft();
  await request(`/drafts/${planDraft.id}/plan`, { method: "POST", body: { enabled: true } });
  const planByChoice = await complete(await createTurn(planDraft, "随机选择", { kind: "plan" }));
  assert.equal(planByChoice.result.plan[0].kind, "write");
  assert.equal((await request(`/drafts/${planDraft.id}`)).revision, planDraft.revision);

  let conflictDraft = await blankDraft();
  const repeated = await failed(await createTurn(conflictDraft, "帮我生成骑行装备的笔记，模拟反复追问"));
  const retried = await complete(await createTurn(conflictDraft, repeated.prompt, { retryOf: repeated.id }));
  assert.match(retried.result.patch.title, /骑行/);
  conflictDraft = await request(`/drafts/${conflictDraft.id}`);
  const late = await createTurn(conflictDraft, "写一篇折叠车通勤笔记，延迟返回");
  conflictDraft = await request(`/drafts/${conflictDraft.id}`, { method: "PATCH", body: {
    revision: conflictDraft.revision, data: { ...conflictDraft.data, title: "用户编辑" },
  } });
  assert.equal((await complete(late)).appliedRevision, null);
  await request(`/runs/${late.id}/apply`, { method: "POST", status: 409 });
  assert.equal((await request(`/drafts/${conflictDraft.id}`)).data.title, "用户编辑");

  const sendPayload = (draft, body, status = 202) =>
    request(`/drafts/${draft.id}/runs`, { method: "POST", status, body });
  const attemptCount = (prompt) => submissions.filter(({ body }) => body?.messages &&
    [body.messages.at(-1)?.content].flat().some((part) => {
      try {
        return JSON.parse((typeof part === "string" ? part : part.text).split("\n").at(-1)).prompt === prompt;
      } catch { return false; }
    })).length;
  for (const order of ["old-first", "new-first", "reply", "fail", "restart", "media"]) {
    const concurrent = await blankDraft();
    const oldPrompt = "写一篇关于折叠自行车的笔记";
    const newPrompt = order === "reply" || order === "restart" ? "你怎么看标题？"
      : order === "fail" ? "未判明用途失败" : order === "media" ? "生成一张配图" : "把标题换成星光通勤";
    const releaseOld = holdReply(oldPrompt);
    const releaseNew = holdReply(newPrompt);
    try {
      const earlier = await createTurn(concurrent, oldPrompt);
      const payload = { revision: concurrent.revision, requestId: randomUUID(), kind: "revise", prompt: newPrompt };
      const countBefore = attemptCount(newPrompt);
      const [later, replay] = await Promise.all([sendPayload(concurrent, payload), sendPayload(concurrent, payload)]);
      assert.equal(later.id, replay.id);
      if (order === "media") {
        releaseOld();
        await complete(earlier);
        releaseNew();
      } else if (order === "new-first") {
        releaseNew();
        await complete(later);
        releaseOld();
      } else {
        releaseOld();
        await until(async () => (await request(`/runs/${earlier.id}`)).status === "awaiting-writeback");
        assert.equal((await request(`/drafts/${concurrent.id}`)).data.title, "");
        if (order === "restart") {
          worker.kill();
          await until(async () => (await readiness()).status === 503);
          assert.equal((await sendPayload(concurrent, { ...payload, requestId: randomUUID() }, 503)).code, "GENERATION_UNAVAILABLE");
          assert.equal((await sendPayload(concurrent, payload)).id, later.id);
          assert.equal((await request(`/drafts/${concurrent.id}`)).revision, concurrent.revision);
          const editable = await blankDraft();
          const editDuringOutage = await request(`/drafts/${editable.id}`, { method: "PATCH", body: {
            revision: editable.revision, name: "备用", data: { ...editable.data, title: "离线手工编辑" },
          } });
          assert.equal((await request(`/drafts/${editable.id}/save`, { method: "POST", body: { revision: editDuringOutage.revision } })).data.title, "离线手工编辑");
          releaseNew();
          worker = service("server/worker.ts");
          await assertReady();
        } else releaseNew();
      }
      if (order === "fail") await failed(later);
      else await complete(later);
      const candidate = await complete(earlier);
      const detail = await request(`/drafts/${concurrent.id}`);
      if (order === "reply" || order === "restart" || order === "media") assert.match(detail.data.title, /折叠自行车/);
      else {
        assert.equal(detail.data.title, order === "fail" ? "" : "星光通勤");
        assert.equal(candidate.appliedRevision, null);
      }
      assert.equal((await sendPayload(concurrent, payload)).id, later.id);
      for (const changed of [{ revision: concurrent.revision + 1 }, { prompt: newPrompt + "变化" }, { retryOf: earlier.id }, { attachments: [randomUUID()] }]) {
        assert.equal((await sendPayload(concurrent, { ...payload, ...changed }, 409)).code, "REQUEST_ID_CONFLICT");
      }
      if (order !== "fail" && order !== "restart" && order !== "media") assert.equal(attemptCount(newPrompt) - countBefore, 1);
    } finally {
      releaseOld();
      releaseNew();
    }
  }
  const competingPlan = await blankDraft();
  const competingPath = `/drafts/${competingPlan.id}`;
  await request(competingPath + "/plan", { method: "POST", body: { enabled: true } });
  const planPayload = { kind: "plan", revision: competingPlan.revision, requestId: randomUUID(), prompt: "想先梳理一下创作安排" };
  const [pendingProposal, duplicateProposal] = await Promise.all([
    sendPayload(competingPlan, planPayload), sendPayload(competingPlan, planPayload),
  ]);
  assert.equal(pendingProposal.id, duplicateProposal.id);
  assert.equal((await sendPayload(competingPlan, { ...planPayload, prompt: "不同计划" }, 409)).code, "REQUEST_ID_CONFLICT");
  assert.equal((await request(competingPath)).planning.latestRunId, pendingProposal.id);
  const approvedPlan = await complete(pendingProposal);
  const releasePlan = holdReply("把标题改成星光通勤");
  try {
    const { run: executing } = await request(competingPath + "/plan/execute", { method: "POST",
      body: { runId: approvedPlan.id, revision: competingPlan.revision },
    });
    const latest = await createTurn(competingPlan, "把标题换成星光通勤");
    await complete(latest);
    releasePlan();
    const displaced = await failed(executing);
    assert.equal(displaced.appliedRevision, null);
    assert.ok(displaced.result.patch.title);
    const pausedPlan = (await request(competingPath)).planning;
    assert.equal(pausedPlan.executionRunId, executing.id);
    await request(competingPath + "/plan/media", { method: "POST", status: 400, body: { stepId: pausedPlan.media[0].id } });
  } finally {
    releasePlan();
  }
  const working = (name) => request("/drafts", { method: "POST", status: 201, body: { name } });
  const saveDraft = (draft, status = 200) => request(`/drafts/${draft.id}/save`, { method: "POST", status, body: { revision: draft.revision } });
  const updateWorking = (draft, data, name) => request(`/drafts/${draft.id}`, { method: "PATCH", body: { revision: draft.revision, name, data } });
  const library = (q = "") => request(`/drafts?q=${encodeURIComponent(q)}`);
  const first = await working("Archive Earbuds");
  assert.equal(first.savedAt, null);
  assert.equal((await library("Earbuds")).items.length, 0);
  const savedBlank = await saveDraft(first);
  assert.equal(savedBlank.hasUnsavedChanges, false);
  assert.equal((await library("archive")).items[0].name, first.name);
  let changedLibrary = await updateWorking(savedBlank, { ...savedBlank.data, title: "修改后的正文标题" }, "临时的新名字");
  assert.equal(changedLibrary.hasUnsavedChanges, true);
  assert.equal((await request(`/drafts/${first.id}`)).name, "临时的新名字");
  assert.equal((await library("临时的新名字")).items.length, 0);
  assert.equal((await library("Archive Earbuds")).items[0].title, "");
  const archiveCandidate = await complete(await createTurn(changedLibrary, "帮我写一篇充电器推荐笔记"));
  changedLibrary = await request(`/drafts/${first.id}`);
  await request(`/drafts/${first.id}/plan`, { method: "POST", body: { enabled: true } });
  await talk(changedLibrary, { kind: "image", fromComposer: true });
  await request(`/drafts/${first.id}/restore`, { method: "POST", status: 409, body: { revision: savedBlank.revision } });
  await request(`/drafts/${first.id}/restore`, { method: "POST", body: { revision: changedLibrary.revision } });
  changedLibrary = await request(`/drafts/${first.id}`);
  assert.equal(changedLibrary.name, "Archive Earbuds");
  assert.equal(changedLibrary.data.title, "");
  assert.equal(changedLibrary.planning, null);
  assert.equal(changedLibrary.brief, null);
  assert.equal(changedLibrary.runs.find(({ id }) => id === archiveCandidate.id).archived, true);
  await request(`/runs/${archiveCandidate.id}/apply`, { method: "POST", status: 400, body: { revision: changedLibrary.revision } });
  assert.equal((await library("Archive")).items[0].savedAt, savedBlank.savedAt);

  const futureMedia = new FormData();
  futureMedia.append("cover", new Blob([png], { type: "image/png" }), "cover.png");
  const { coverId: archiveCoverId } = await request(`/drafts/${first.id}/cover`, { method: "POST", status: 201, body: futureMedia });
  changedLibrary = await updateWorking(changedLibrary, { ...changedLibrary.data, title: "正式标题", body: "手动保存后可复原", coverId: archiveCoverId }, "耳机新名字");
  await saveDraft(changedLibrary);
  assert.equal((await library("正式标题")).items[0].name, "耳机新名字");
  const publishedFromLibrary = await request(`/drafts/${first.id}/finalizations`, { method: "POST", status: 201, body: { revision: changedLibrary.revision } });
  const searchPage = await Promise.all(Array.from({ length: 31 }, (_, i) => working(`分页用草稿 ${i}`).then((draft) => saveDraft(draft))));
  const firstPage = await library();
  assert.equal(firstPage.items.length, 30);
  assert.ok(firstPage.nextCursor);
  assert.equal(firstPage.items.some(({ id }) => id === first.id), false);
  const nextPage = await request(`/drafts?cursor=${firstPage.nextCursor}`);
  assert.ok(nextPage.items.some(({ id }) => id === first.id));
  assert.equal((await library("耳机新名字")).items[0].id, first.id);
  await request(`/drafts/${first.id}/pin`, { method: "PATCH", body: { pinned: true } });
  assert.equal((await library()).items[0].id, first.id);
  await request(`/drafts/${first.id}/pin`, { method: "PATCH", body: { pinned: false } });
  assert.ok(searchPage.some(({ id }) => id === firstPage.items[0].id));
  await request(`/drafts/${first.id}/pin`, { method: "PATCH", id: "other", body: { pinned: true }, status: 404 });
  await request(`/drafts/${first.id}`, { method: "DELETE", id: "other", status: 404 });
  await request(`/drafts/${first.id}`, { method: "DELETE", status: 204, raw: true });
  await request(`/drafts/${first.id}`, { status: 404 });
  await request(`/media/${archiveCoverId}`, { status: 404 });
  assert.equal((await library("正式标题")).items.length, 0);
  const publicationHeaders = { authorization: `Bearer ${token}` };
  assert.equal((await request(`/finalizations/${publishedFromLibrary.finalizationId}`, { headers: publicationHeaders })).title, "正式标题");
  assert.deepEqual(await request(`/finalizations/${publishedFromLibrary.finalizationId}/cover`, { headers: publicationHeaders, raw: true }), png);
  assert.equal((await request("/admin/models/text/test-tools", { method: "POST", id: "admin" })).ok, true);
  let toolDraft = await working("Pi 工具回归");
  toolDraft = await updateWorking(toolDraft, { ...toolDraft.data, title: "通勤包", body: "第一段保留。\n\n这段等资料。\n\n第三段保留。" });
  const materials = new FormData();
  materials.append("attachment", new Blob(["实测尺寸资料：可以放入 13 寸电脑。"]), "通勤规格.md");
  const material = await request(`/drafts/${toolDraft.id}/attachments`, { method: "POST", status: 201, body: materials });
  const sourceRef = await request(`/drafts/${toolDraft.id}/workspace`, { method: "POST", status: 201, body: { attachmentId: material.id } });
  const toolRun = await complete(await createTurn(toolDraft, "工具回归：查通勤规格，然后只改第二段。"));
  assert.deepEqual(toolRun.toolProgress.map(({ status }) => status), ["done", "done", "done", "done"]);
  assert.deepEqual(toolRun.result.sources, [sourceRef]);
  assert.deepEqual(toolRun.result.toolChecks.errors, []);
  const toolDraftAfter = await request(`/drafts/${toolDraft.id}`);
  assert.equal(toolDraftAfter.data.body, "第一段保留。\n\n实测尺寸资料：可以放入 13 寸电脑。\n\n第三段保留。");

  const piCandidate = (draft, result) => prisma.run.create({ data: {
    id: randomUUID(), draftId: draft.id, baseRevision: draft.revision, kind: "revise", status: "succeeded",
    input: { piStage: true }, result: { message: "Pi 写回回归", ...result },
  } });
  let piDraft = await working("Pi 写回与撤销");
  piDraft = await updateWorking(piDraft, { ...piDraft.data, title: "旧标题", body: "旧开头\n旧尾段" });
  const editedBody = "新开头\n旧尾段";
  const localPi = await piCandidate(piDraft, {
    before: { body: piDraft.data.body }, patch: { body: editedBody }, edits: [{ find: "旧开头", replace: "新开头" }],
  });
  const wholePi = await piCandidate(piDraft, { before: { body: piDraft.data.body }, patch: { body: "整篇替换" } });
  const conflictingPi = await piCandidate(piDraft, {
    before: { body: piDraft.data.body }, patch: { body: "旧开头\n候选尾段" }, edits: [{ find: "旧尾段", replace: "候选尾段" }],
  });
  piDraft = await updateWorking(piDraft, { ...piDraft.data, body: "旧开头\n人工编辑尾段" });
  const applyConflict = (run) => request(`/runs/${run.id}/apply`, { method: "POST", status: 409, body: { revision: piDraft.revision } });
  assert.equal((await applyConflict(wholePi)).code, "REVISION_CONFLICT");
  assert.equal((await request(`/runs/${wholePi.id}/apply`, { method: "POST", status: 409 })).code, "REVISION_CONFLICT");
  assert.equal((await applyConflict(conflictingPi)).code, "REVISION_CONFLICT");
  const unchangedPi = await request(`/drafts/${piDraft.id}`);
  assert.equal(unchangedPi.revision, piDraft.revision);
  assert.equal(unchangedPi.data.body, "旧开头\n人工编辑尾段");
  assert.equal((await request(`/runs/${conflictingPi.id}`)).appliedRevision, null);

  piDraft = await apply(localPi, piDraft);
  assert.equal(piDraft.data.body, "新开头\n人工编辑尾段");
  const appliedPi = await request(`/runs/${localPi.id}`);
  assert.deepEqual(appliedPi.result.appliedPatch, { body: piDraft.data.body });
  assert.deepEqual(appliedPi.result.appliedBefore, { body: "旧开头\n人工编辑尾段" });
  assert.deepEqual(appliedPi.result.patch, { body: editedBody });
  piDraft = await request(`/runs/${localPi.id}/undo`, { method: "POST" });
  assert.equal(piDraft.data.body, "旧开头\n人工编辑尾段");

  const piTitle = await piCandidate(piDraft, { before: { title: "旧标题" }, patch: { title: "新标题" } });
  piDraft = await apply(piTitle, piDraft);
  piDraft = await request(`/runs/${piTitle.id}/undo`, { method: "POST" });
  piDraft = await updateWorking(piDraft, { ...piDraft.data, title: "新标题", body: "后续人工编辑" });
  const noOpPi = await apply(piTitle, piDraft);
  assert.equal(noOpPi.revision, piDraft.revision);
  assert.deepEqual(noOpPi.changed, []);
  assert.equal((await prisma.run.findUniqueOrThrow({ where: { id: piTitle.id } })).undoData, null);
  assert.equal((await request(`/runs/${piTitle.id}/undo`, { method: "POST", status: 409 })).code, "REVISION_CONFLICT");
  assert.equal((await request(`/drafts/${piDraft.id}`)).data.body, "后续人工编辑");
  console.log("通过：创作、后台媒体整理与恢复、批量状态、确认生成、草稿库与发布快照");
} finally {
  for (const child of processes) child.kill();
  fixture.close();
  const schema = database.searchParams.get("schema");
  if (/^creation_test_[\da-f]{12}$/.test(schema)) await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`).catch(() => undefined);
  await prisma.$disconnect();
  await rm(storage, { recursive: true, force: true });
}
