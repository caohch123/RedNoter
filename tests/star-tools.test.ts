import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { emptyDraft, type RunInput } from "../server/domain.js";
import { makeStarTools } from "../server/star-tools.js";

const input: RunInput = {
  draft: { ...emptyDraft, title: "通勤包", body: "第一段。\n\n第二段。\n\n第三段。" },
  history: [], attachments: [],
};
const task = { draftId: randomUUID(), ownerId: "test-owner", baseRevision: 2, progress: async () => {} };

test("局部改稿校验段落范围，重新检查后才交给写回", async () => {
  const session = makeStarTools(task, input, "revise", true, false, "只改第二段");
  const edit = session.tools.find(({ name }) => name === "edit_note")!;
  const check = session.tools.find(({ name }) => name === "check_note")!;
  await assert.rejects(edit.execute("wrong", { replace: { original: "第一段。", replacement: "不应写入" } }), /指定的段落/);
  await assert.rejects(edit.execute("whole", { fields: { body: "替换全文" } }), /超出指定范围/);
  await edit.execute("correct", { replace: { original: "第二段。", replacement: "规格待核对。" } });
  assert.equal(session.outcome().patch, undefined);
  await check.execute("check", { verify: ["规格待核对。", "不在正文"] });
  assert.deepEqual(session.outcome().toolChecks?.verify, ["规格待核对。"]);
  assert.equal(session.outcome().patch?.body, "第一段。\n\n规格待核对。\n\n第三段。");
  assert.equal(input.draft.body, "第一段。\n\n第二段。\n\n第三段。");
});

test("计划讨论只读，Markdown 工具需要对应授权", async () => {
  const allowedInput = { ...input, artifactWrite: "create" as const, artifactCount: 2 };
  const planning = makeStarTools(task, allowedInput, "plan", true, false);
  assert.ok(!planning.tools.some(({ name }) => name === "edit_note" || name === "write_markdown"));
  assert.ok(!makeStarTools(task, input, "revise", false, false).tools.some(({ name }) => name === "edit_note" || name === "write_markdown"));
  const execution = makeStarTools(task, { ...allowedInput, planExecution: true, planWritesNote: false }, "revise", true, false);
  assert.ok(!execution.tools.some(({ name }) => name === "edit_note"));
  const write = execution.tools.find(({ name }) => name === "write_markdown")!;
  await assert.rejects(write.execute("one", { outputs: [{ name: "一.md", markdown: "# 一" }] }), /数量/);
  assert.equal(execution.outcome().artifacts, undefined);
  await write.execute("two", { outputs: [{ name: "一.md", markdown: "# 一" }, { name: "二.md", markdown: "# 二" }] });
  assert.equal(execution.outcome().artifacts?.length, 2);
});
