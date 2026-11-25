import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const dir = await mkdtemp(join(tmpdir(), "pi-workspace-"));
process.env.PI_ROOT = dir;

const ws = await import("../server/pi/workspace.js");

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("摘星资料按版本写入只读副本，并保留旧版本", async () => {
  const draftId = "11111111-1111-4111-8111-111111111111";
  await ws.importReferences(draftId, [{
    fileId: "file-1", versionId: "v1", version: 1, name: "参考笔记.md", mime: "text/markdown",
    body: Buffer.from("第一版"),
  }]);
  await ws.importReferences(draftId, [{
    fileId: "file-1", versionId: "v2", version: 2, name: "参考笔记.md", mime: "text/markdown",
    body: Buffer.from("第二版"),
  }]);

  const files = await ws.listWorkspace(draftId);
  const references = files.filter((file) => file.path.startsWith("references/"));
  assert.equal(references.length, 2);
  assert.deepEqual(references.map((file) => file.reference?.version).sort(), [1, 2]);
  assert.ok(references.every((file) => file.reference?.fileId === "file-1"));

  const second = await ws.readWorkspaceFile(draftId, "references/v2-参考笔记.md");
  assert.equal(second.body.toString("utf8"), "第二版");
  const manifest = JSON.parse(await readFile(join(dir, "workspaces", draftId, "references", ".manifest.json"), "utf8"));
  assert.equal(manifest.v2.version, 2);
  assert.equal(manifest.v1.version, 1);

  await assert.rejects(() => ws.readWorkspaceFile(draftId, "../../etc/passwd"), /不在草稿工作区/);
  assert.throws(() => ws.resolveInside(draftId, "../escape"), /不在草稿工作区/);
});

test("嵌套文件夹上传、空目录保留与目录容量统计", async () => {
  const draftId = "22222222-2222-4222-8222-222222222222";
  await ws.ensureWorkspace(draftId);
  const initial = await ws.listWorkspaceDetail(draftId);
  assert.deepEqual(initial.files, []);
  assert.deepEqual(initial.directories, []);
  assert.equal(initial.totalBytes, 0);

  const result = await ws.writeWorkspaceFiles(
    draftId,
    [
      { path: "产品资料/卖点/概览.md", body: Buffer.from("# 产品概览", "utf8") },
      { path: "产品资料/数据.csv", body: Buffer.from("a,b\n1,2\n", "utf8") },
    ],
    { emptyDirs: ["产品资料/待补充"] },
  );

  assert.equal(result.saved.length, 2);
  assert.equal(result.skipped.length, 0);
  const detail = await ws.listWorkspaceDetail(draftId);
  assert.deepEqual(detail.files.map((f) => f.path), ["产品资料/卖点/概览.md", "产品资料/数据.csv"]);
  assert.ok(detail.directories.includes("产品资料"));
  assert.ok(detail.directories.includes("产品资料/卖点"));
  assert.ok(detail.directories.includes("产品资料/待补充"));
  assert.ok(!detail.directories.includes("references"));
  assert.equal(detail.totalBytes, Buffer.from("# 产品概览", "utf8").length + Buffer.from("a,b\n1,2\n", "utf8").length);
});

test("自动忽略噪声目录与系统文件，并过滤不支持扩展名", async () => {
  const draftId = "33333333-3333-4333-8333-333333333333";
  const result = await ws.writeWorkspaceFiles(draftId, [
    { path: "项目/.git/config", body: Buffer.from("core") },
    { path: "项目/node_modules/pkg/index.js", body: Buffer.from("module") },
    { path: "项目/.DS_Store", body: Buffer.from("mac") },
    { path: "项目/bin/app.exe", body: Buffer.from("mz") },
    { path: "项目/README", body: Buffer.from("ok") },
    { path: "项目/docs/指南.pdf", body: Buffer.from("%PDF-1.4") },
  ]);

  assert.deepEqual(result.saved.map((f) => f.path).sort(), ["项目/README", "项目/docs/指南.pdf"]);
  const reasons = new Map(result.skipped.map((s) => [s.path, s.reason]));
  assert.equal(reasons.get("项目/.git/config"), "ignored");
  assert.equal(reasons.get("项目/node_modules/pkg/index.js"), "ignored");
  assert.equal(reasons.get("项目/.DS_Store"), "ignored");
  assert.equal(reasons.get("项目/bin/app.exe"), "unsupported");
});

test("与 references 重名自动避让，不影响只读资料区", async () => {
  const draftId = "44444444-4444-4444-8444-444444444444";
  await ws.importReferences(draftId, [{
    fileId: "file-r1", versionId: "rv1", version: 1, name: "原始参考.md", mime: "text/markdown",
    body: Buffer.from("只读原文"),
  }]);

  const res = await ws.writeWorkspaceFiles(draftId, [
    { path: "references/用户上传.md", body: Buffer.from("新上传") },
  ]);
  assert.equal(res.rootMap.references, "references-导入");
  assert.deepEqual(res.saved.map((f) => f.path), ["references-导入/用户上传.md"]);

  const refRead = await ws.readWorkspaceFile(draftId, "references/v1-原始参考.md");
  assert.equal(refRead.body.toString("utf8"), "只读原文");
});

test("冲突处理：覆盖合并保留其它文件；另存为新目录保持多批一致", async () => {
  const draftId = "55555555-5555-4555-8555-555555555555";
  await ws.writeWorkspaceFiles(draftId, [
    { path: "素材库/a.md", body: Buffer.from("旧A") },
    { path: "素材库/extra.md", body: Buffer.from("保留文件") },
    { path: "单独.md", body: Buffer.from("旧单文件") },
  ]);

  await ws.writeWorkspaceFiles(
    draftId,
    [{ path: "素材库/a.md", body: Buffer.from("新A") }],
    { conflict: "overwrite" },
  );
  assert.equal((await ws.readWorkspaceFile(draftId, "素材库/a.md")).body.toString("utf8"), "新A");
  assert.equal((await ws.readWorkspaceFile(draftId, "素材库/extra.md")).body.toString("utf8"), "保留文件");

  const batch1 = await ws.writeWorkspaceFiles(
    draftId,
    [{ path: "素材库/part1.md", body: Buffer.from("P1") }],
    { conflict: "rename" },
  );
  assert.equal(batch1.rootMap["素材库"], "素材库-2");
  assert.deepEqual(batch1.saved.map((f) => f.path), ["素材库-2/part1.md"]);

  // 模拟前端第 2 批沿用 rootMap 并以 overwrite 落入同一个新目录
  const mappedRoot = batch1.rootMap["素材库"];
  const batch2 = await ws.writeWorkspaceFiles(
    draftId,
    [{ path: `${mappedRoot}/part2.md`, body: Buffer.from("P2") }],
    { conflict: "overwrite" },
  );
  assert.deepEqual(batch2.saved.map((f) => f.path), ["素材库-2/part2.md"]);

  const singleRename = await ws.writeWorkspaceFiles(
    draftId,
    [{ path: "单独.md", body: Buffer.from("新单文件") }],
    { conflict: "rename" },
  );
  assert.deepEqual(singleRename.saved.map((f) => f.path), ["单独-2.md"]);
});

test("单文件超限与工作区总配额上限校验", async () => {
  const draftId = "66666666-6666-4666-8666-666666666666";
  const res = await ws.writeWorkspaceFiles(
    draftId,
    [
      { path: "ok1.txt", body: Buffer.alloc(60, 65) },
      { path: "too-big.txt", body: Buffer.alloc(120, 66) },
      { path: "over-quota.txt", body: Buffer.alloc(60, 67) },
    ],
    { maxFileBytes: 100, maxWorkspaceBytes: 100 },
  );

  assert.deepEqual(res.saved.map((f) => f.path), ["ok1.txt"]);
  const reasons = new Map(res.skipped.map((s) => [s.path, s.reason]));
  assert.equal(reasons.get("too-big.txt"), "too-large");
  assert.equal(reasons.get("over-quota.txt"), "quota");
  assert.equal(res.totalBytes, 60);
});

test("路径穿越与绝对路径拦截", async () => {
  const draftId = "77777777-7777-4777-8777-777777777777";
  await ws.ensureWorkspace(draftId);
  for (const bad of ["../evil.md", "sub/../../evil.md", "/etc/passwd", "C:\\Windows\\win.ini", "\\\\server\\share\\a.txt"]) {
    await assert.rejects(() => ws.writeWorkspaceFiles(draftId, [{ path: bad, body: Buffer.from("x") }]));
    await assert.rejects(() => ws.deleteWorkspacePath(draftId, bad));
    await assert.rejects(() => ws.resolveWorkspacePaths(draftId, [bad]));
  }
});

test("删除文件与文件夹成功，且保护 references 只读资料区", async () => {
  const draftId = "88888888-8888-4888-8888-888888888888";
  await ws.importReferences(draftId, [{
    fileId: "file-r2", versionId: "rv2", version: 1, name: "受保护.md", mime: "text/markdown",
    body: Buffer.from("不能删"),
  }]);
  await ws.writeWorkspaceFiles(draftId, [
    { path: "临时目录/笔记.md", body: Buffer.from("待删") },
    { path: "单文件.md", body: Buffer.from("单删") },
  ]);

  await assert.rejects(() => ws.deleteWorkspacePath(draftId, "references"), /只读资料区/);
  await assert.rejects(() => ws.deleteWorkspacePath(draftId, "References"), /只读资料区/);
  await assert.rejects(() => ws.deleteWorkspacePath(draftId, "references/v1-受保护.md"), /只读资料区/);

  await ws.deleteWorkspacePath(draftId, "单文件.md");
  await ws.deleteWorkspacePath(draftId, "临时目录");
  const list = await ws.listWorkspace(draftId);
  assert.deepEqual(list.map((f) => f.path), ["references/v1-受保护.md"]);
});

test("resolveWorkspacePaths 识别文件与文件夹并拦截无效路径", async () => {
  const draftId = "99999999-9999-4999-8999-999999999999";
  await ws.writeWorkspaceFiles(draftId, [
    { path: "调研/竞品.md", body: Buffer.from("内容") },
  ]);

  const resolved = await ws.resolveWorkspacePaths(draftId, ["调研/", "调研/竞品.md", "调研"]);
  assert.deepEqual(resolved, [
    { path: "调研", kind: "dir" },
    { path: "调研/竞品.md", kind: "file" },
  ]);

  await assert.rejects(() => ws.resolveWorkspacePaths(draftId, ["不存在.md"]), /不存在/);
});
