import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const base = `${origin}/api/v1/creation`;
const api = `http://127.0.0.1:${process.env.CREATION_PORT ?? 3002}/v1/creation`;
const publisher = `Bearer ${process.env.PUBLISH_READ_TOKEN}`;
assert.ok(process.env.PUBLISH_READ_TOKEN, "设置 PUBLISH_READ_TOKEN");

async function register() {
  const result = await fetch(`${origin}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `check_${randomUUID().slice(0, 8)}`, password: "Test12345" }),
  });
  assert.equal(result.status, 201, await result.clone().text());
  return result.headers.getSetCookie()[0].split(";")[0];
}

async function call(context, path, { method = "GET", body, status = 200, binary = false } = {}) {
  const isUpload = body instanceof FormData;
  const result = await fetch(`${context.url}${path}`, {
    method,
    headers: { ...context.headers, ...(body && !isUpload ? { "Content-Type": "application/json" } : {}) },
    body: body && !isUpload ? JSON.stringify(body) : body,
  });
  if (result.status !== status) assert.fail(`${method} ${path}: expected ${status}, got ${result.status}: ${await result.text()}`);
  return binary ? Buffer.from(await result.arrayBuffer()) : result.json();
}

const cookie = await register();
const otherCookie = await register();
const owner = { url: base, headers: { cookie } };
const other = { url: base, headers: { cookie: otherCookie } };
const consumer = { url: api, headers: { authorization: publisher } };
const post = (ctx, path, body, status = 200) => call(ctx, path, { method: "POST", body, status });
const save = (draft, data, status = 200) => call(owner, `/drafts/${draft.id}`, {
  method: "PATCH", body: { revision: draft.revision, data }, status,
});
const start = (draft, kind, prompt, requestId = randomUUID()) =>
  post(owner, `/drafts/${draft.id}/runs`, { revision: draft.revision, kind, prompt, requestId }, 202);

async function result(run) {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    const value = await call(owner, `/runs/${run.id}`);
    assert.notEqual(value.status, "failed", value.error);
    if (value.status === "succeeded") return value;
    await wait(450);
  }
  assert.fail(`任务超时 ${run.id}`);
}

assert.equal((await call(owner, "/config")).demo, true);
const original = await post(owner, "/drafts", undefined, 201);
assert.equal(original.data.title, "");
const example = await post(owner, "/drafts", { example: true }, 201);
assert.ok(example.data.example && example.data.body);
const brief = await save(original, { ...original.data, settings: { ...original.data.settings, topic: "通勤笔记", facts: "能放 13 寸电脑" } });
assert.equal((await save(original, original.data, 409)).code, "REVISION_CONFLICT");
assert.equal((await call(other, `/drafts/${brief.id}`, { status: 404 })).code, "NOT_FOUND");
const requestId = randomUUID();
const pending = await start(brief, "generate", undefined, requestId);
assert.equal((await start(brief, "generate", undefined, requestId)).id, pending.id);
const completed = await result(pending);
const working = await call(owner, `/drafts/${brief.id}`);
assert.equal(completed.appliedRevision, working.revision);
assert.match(working.data.body, /13 寸电脑/);
assert.equal(working.savedAt, null);
assert.equal((await call(owner, "/drafts")).items.some(({ id }) => id === brief.id), false);
const edited = await save(working, { ...working.data, body: "手工正文" });
assert.equal((await post(owner, `/runs/${pending.id}/apply`, undefined, 409)).code, "REVISION_CONFLICT");
assert.equal((await call(owner, `/drafts/${edited.id}`)).data.body, "手工正文");
const candidate = await result(await start(edited, "generate"));
let draft = await post(owner, `/runs/${candidate.id}/apply`);
assert.match(draft.data.body, /13 寸电脑/);
const revision = await result(await start(draft, "revise", "补充话题标签"));
assert.deepEqual(Object.keys(revision.result.patch), ["tags"]);
draft = await post(owner, `/runs/${revision.id}/apply`);
const undo = await post(owner, `/runs/${revision.id}/undo`);
assert.deepEqual(undo.data.tags, candidate.result.patch.tags);
draft = await post(owner, `/runs/${revision.id}/apply`, { revision: undo.revision });

const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=", "base64");
const form = new FormData();
form.append("cover", new Blob([photo], { type: "image/png" }), "cover.png");
const { coverId } = await post(owner, `/drafts/${draft.id}/cover`, form, 201);
await call(other, `/media/${coverId}`, { status: 404 });
assert.deepEqual(await call(owner, `/media/${coverId}`, { binary: true }), photo);
draft = await save(draft, { ...draft.data, coverId, title: "通勤记录", body: `${draft.data.body}\n全网第一` });
const checks = await call(owner, `/drafts/${draft.id}/checks`);
assert.match(checks.warnings.join(""), /全网第一/);
const path = `/drafts/${draft.id}/finalizations`;
const finals = await Promise.all([
  fetch(`${base}${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision }) }),
  fetch(`${base}${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision }) }),
]);
assert.ok(finals.every((response) => response.ok));
const [first, duplicate] = await Promise.all(finals.map((response) => response.json()));
assert.equal(first.finalizationId, duplicate.finalizationId);
assert.deepEqual(await call(consumer, `/finalizations/${first.finalizationId}/cover`, { binary: true }), photo);
await call(owner, `/finalizations/${first.finalizationId}`, { status: 401 });
const newDraft = await save(draft, { ...draft.data, title: "更新后的通勤记录" });
const second = await post(owner, path, { revision: newDraft.revision }, 201);
assert.notEqual(first.finalizationId, second.finalizationId);
assert.equal((await call(consumer, `/finalizations/${first.finalizationId}`)).title, "通勤记录");

let cursor = null;
const found = new Set();
for (let i = 0; i < 200; i++) {
  const page = await call(consumer, `/finalizations?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
  for (const { finalizationId } of page.items) {
    assert.ok(!found.has(finalizationId));
    found.add(finalizationId);
  }
  cursor = page.nextCursor;
  if (!page.hasMore) break;
}
assert.ok(found.has(first.finalizationId) && found.has(second.finalizationId));
assert.deepEqual((await call(consumer, `/finalizations?cursor=${cursor}`)).items, []);

const rewrite = await post(owner, "/drafts", undefined, 201);
const rewriteBrief = await save(rewrite, { ...rewrite.data, settings: { ...rewrite.data.settings,
  mode: "rewrite", reference: "旧参考\n\n段落内容\n\n你怎么看？" } });
const analysis = await result(await start(rewriteBrief, "analyze"));
assert.equal(analysis.result.analysis.length, 5);
const revised = await result(await start(rewriteBrief, "generate"));
assert.ok(revised.result.patch.body);
assert.doesNotMatch(revised.result.patch.body, /旧参考/);
assert.ok((await call(owner, `/drafts/${rewrite.id}`)).runs.some((item) => item.id === revised.id));
console.log("通过：原创、仿写、对话候选、持久化、冲突、封面、定稿、权限、游标读取");
