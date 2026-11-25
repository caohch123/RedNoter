import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createUiContext, type UiRequest } from "../server/pi/ui.js";
import { createStarExtension } from "../server/pi/star-extension.js";
import { resolvePiStagePatch, tryApplyEdits } from "../server/domain.js";
import { isSafeSessionFile, ownedSessionFile } from "../server/pi/session.js";
import { referenceIdentity, turnForPrompt, validateCandidate } from "../server/pi/turn.js";
import { mediaArtifact } from "../server/pi/presentation.js";
import { webSearch } from "../server/web-search.js";

test("UiBridge askUser 支持多题结构化回答、推荐默认项回填、取消与快照恢复", async () => {
  const emitted: UiRequest[] = [];
  const counts: number[] = [];
  const bridge = createUiContext(
    (req) => emitted.push(req),
    (count) => counts.push(count),
  );

  // 1. 挂起提问 -> pendingRequests 可恢复 -> 用户提交回答
  const p1 = bridge.askUser({
    title: "先对齐写作方向",
    summary: "确认一下视角和卖点重点",
    questions: [
      {
        id: "angle",
        question: "想主打哪个视角？",
        kind: "single",
        options: [
          { label: "早八通勤痛点", recommended: true },
          { label: "开箱外观测评" },
        ],
      },
      {
        id: "highlights",
        question: "重点强调哪些卖点？",
        kind: "multi",
        options: [
          { label: "能装 13 寸电脑" },
          { label: "自重轻不勒肩", recommended: true },
        ],
      },
      {
        id: "extra",
        question: "还有补充细节吗？",
        kind: "text",
      },
    ],
  });

  assert.equal(bridge.pendingCount(), 1);
  assert.equal(bridge.pendingRequests().length, 1);
  assert.equal(bridge.pendingRequests()[0]?.method, "ask");
  assert.equal(emitted.length, 1);

  const reqId1 = emitted[0].id;
  assert.equal(
    bridge.respond(reqId1, {
      answers: {
        angle: "开箱外观测评",
        highlights: ["能装 13 寸电脑", "自重轻不勒肩"],
        extra: "顺便提一句拉链很顺滑",
      },
    }),
    true,
  );

  const res1 = await p1;
  assert.deepEqual(res1, {
    answers: {
      angle: "开箱外观测评",
      highlights: ["能装 13 寸电脑", "自重轻不勒肩"],
      extra: "顺便提一句拉链很顺滑",
    },
  });
  assert.equal(bridge.pendingCount(), 0);
  assert.deepEqual(bridge.pendingRequests(), []);

  // 2. useRecommended 自动回填：有 recommended 取推荐项，无标记取首项
  const p2 = bridge.askUser({
    title: "快速确认",
    questions: [
      {
        id: "q_rec",
        question: "选风格",
        kind: "single",
        options: [
          { label: "方案A" },
          { label: "方案B", recommended: true },
        ],
      },
      {
        id: "q_fallback",
        question: "选篇幅",
        kind: "multi",
        options: [
          { label: "标准篇幅" },
          { label: "短笔记" },
        ],
      },
      {
        id: "q_text",
        question: "补充",
        kind: "text",
      },
    ],
  });

  const reqId2 = emitted[1].id;
  assert.equal(bridge.respond(reqId2, { useRecommended: true }), true);
  const res2 = await p2;
  assert.deepEqual(res2, {
    answers: {
      q_rec: "方案B",
      q_fallback: ["标准篇幅"],
      q_text: "",
    },
    useRecommended: true,
  });

  // 3. 取消 / cancelAll 均安全结束挂起并清空 pendingRequests
  const p3 = bridge.askUser({
    title: "待取消",
    questions: [{ id: "q1", question: "确认？", kind: "text" }],
  });
  assert.equal(bridge.pendingCount(), 1);
  bridge.cancelAll();
  const res3 = await p3;
  assert.deepEqual(res3, { answers: {}, cancelled: true });
  assert.equal(bridge.pendingCount(), 0);
  assert.deepEqual(bridge.pendingRequests(), []);
  assert.ok(counts.includes(1) && counts.at(-1) === 0);
});

test("star_ask_user 与 star_stage_note 工具返回中文摘要并记录改前 Diff 元数据", async () => {
  type RegisteredTool = {
    name: string;
    execute: (id: string, params: unknown, signal?: unknown, onUpdate?: unknown, ctx?: unknown) => Promise<{
      content: { type: string; text: string }[];
    }>;
  };
  const tools = new Map<string, RegisteredTool>();
  let stagedPayload: Record<string, unknown> | undefined;

  const extension = createStarExtension({
    draftId: "11111111-1111-4111-8111-111111111111",
    async readNote() {
      return {
        title: "旧标题",
        body: "第一段原有内容，长度足够四十个字以上的测试正文内容确保局部编辑校验通过。\n\n第二段完全不变的保留段落内容。",
        tags: ["通勤", "旧标签"],
        revision: 3,
        facts: "能装 13 寸电脑",
        audience: "早八族",
        mode: "original",
        topic: "通勤包",
        referenceTitle: null,
      };
    },
    async stageNote(input) {
      stagedPayload = input as unknown as Record<string, unknown>;
      return { runId: "22222222-2222-4222-8222-222222222222", revision: 3 };
    },
    async askUser(input) {
      assert.equal(input.questions[0].options?.[0].recommended, true);
      return { answers: { angle: input.questions[0].options![0].label }, useRecommended: true };
    },
  });

  extension.factory({
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as unknown as ExtensionAPI);

  const askTool = tools.get("star_ask_user")!;
  const askResult = await askTool.execute("c1", {
    title: "选视角",
    questions: [{
      id: "angle",
      question: "主打什么角度？",
      kind: "single",
      options: [{ label: "通勤装下 13 寸电脑" }, { label: "周末出游" }],
    }],
  });
  const parsedAsk = JSON.parse(askResult.content[0].text) as { formattedSummary: string; useRecommended: boolean };
  assert.equal(parsedAsk.useRecommended, true);
  assert.match(parsedAsk.formattedSummary, /主打什么角度？：通勤装下 13 寸电脑/);

  const stageTool = tools.get("star_stage_note")!;
  await stageTool.execute("c2", {
    title: "新爆款标题",
    edits: [{ find: "第一段原有内容", replace: "第一段更抓人开头" }],
    tags: ["通勤", "好物"],
    message: "优化了标题和开头",
  });

  assert.equal(stagedPayload?.title, "新爆款标题");
  assert.deepEqual(stagedPayload?.before, {
    title: "旧标题",
    body: "第一段原有内容，长度足够四十个字以上的测试正文内容确保局部编辑校验通过。\n\n第二段完全不变的保留段落内容。",
    tags: ["通勤", "旧标签"],
  });
  assert.deepEqual(stagedPayload?.edits, [{ find: "第一段原有内容", replace: "第一段更抓人开头" }]);
  assert.equal(stagedPayload?.baseRevision, 3);
});

test("卡片可直接渲染，付费生图等待用户确认实际提交的画面方案", async () => {
  type RegisteredTool = {
    name: string;
    execute: (id: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown, ctx?: {
      ui: { confirm(title: string, message: string): Promise<boolean> };
    }) => Promise<{ content: { type: string; text: string }[] }>;
  };
  const tools = new Map<string, RegisteredTool>();
  let renderedCards: unknown[] = [];
  let generatedItems: unknown[] = [];
  const approvals: string[] = [];
  const note = {
    title: "", body: "", tags: [], revision: 1,
    facts: "", audience: "", mode: "original" as const, topic: "雅思词汇", referenceTitle: null,
  };

  const extension = createStarExtension({
    draftId: "11111111-1111-4111-8111-111111111111",
    currentTurn() {
      return { requestId: "11111111-1111-4111-8111-111111111111", sessionId: "pi-session-media",
        userText: "生成写实桌面配图", kind: "chat", note };
    },
    async readNote() {
      return note;
    },
    async stageNote() {
      return { runId: "22222222-2222-4222-8222-222222222222", revision: 1 };
    },
    async askUser() {
      return { answers: {}, useRecommended: true };
    },
    async renderCards(input) {
      renderedCards = input.cards;
      return {
        engine: "card",
        revision: 1,
        items: input.cards.map((card, index) => ({
          mediaId: `33333333-3333-4333-8333-33333333330${index + 1}`,
          runId: `33333333-3333-4333-8333-33333333330${index + 1}`,
          url: `/v1/creation/media/33333333-3333-4333-8333-33333333330${index + 1}`,
          label: card.template === "vocab" ? card.word : `卡片 ${index + 1}`,
          status: "succeeded" as const,
        })),
      };
    },
    async generateImages(input) {
      generatedItems = input.items;
      approvals.push(input.approvalId);
      return {
        engine: "bailian",
        revision: 1,
        items: input.items.map((item, index) => ({
          mediaId: `44444444-4444-4444-8444-44444444440${index + 1}`,
          runId: `44444444-4444-4444-8444-44444444440${index + 1}`,
          url: `/v1/creation/media/44444444-4444-4444-8444-44444444440${index + 1}`,
          label: item.label ?? item.prompt,
          status: "queued" as const,
        })),
      };
    },
  });

  extension.factory({
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as unknown as ExtensionAPI);

  const renderTool = tools.get("star_render_cards")!;
  assert.ok(renderTool);
  const renderRes = await renderTool.execute("r1", {
    cards: [
      { template: "vocab", word: "ambiguous", phonetic: "/æmˈbɪɡjuəs/", meaning: "模棱两可的" },
      { template: "vocab", theme: "mint", word: "deteriorate", phonetic: "/dɪˈtɪəriəreɪt/", meaning: "恶化" },
    ],
  });
  assert.equal(renderedCards.length, 2);
  assert.equal((renderedCards[0] as { theme: string }).theme, "cream");
  const parsedRender = JSON.parse(renderRes.content[0].text) as { engine: string; items: { mediaId: string }[] };
  assert.equal(parsedRender.engine, "card");
  assert.equal(parsedRender.items.length, 2);

  const genTool = tools.get("star_generate_images")!;
  assert.ok(genTool);
  await assert.rejects(
    genTool.execute("g1", { confirmed: true, items: [{ label: "桌面", prompt: "清晨阳光照在英文笔记本上" }] }),
    /付费确认/,
  );
  const plan = {
    confirmed: true,
    items: [{ label: " 图1 桌面 ", prompt: " 清晨自然光照在极简咖啡木桌与英文笔记本上，胶片质感 " }],
  };
  const declined = await genTool.execute("g1", plan, undefined, undefined, { ui: { confirm: async () => false } });
  assert.match(declined.content[0].text, /未提交付费任务/);
  assert.equal(approvals.length, 0);
  const pending = Promise.withResolvers<boolean>();
  let confirmMessage = "";
  const result = genTool.execute("g2", plan, undefined, undefined, {
    ui: { confirm: async (title, message) => {
      assert.match(title, /1 张/);
      confirmMessage = message;
      return pending.promise;
    } },
  });
  assert.match(confirmMessage, /图1 桌面（3:4）\n清晨自然光照在极简咖啡木桌与英文笔记本上，胶片质感/);
  assert.equal(approvals.length, 0);
  pending.resolve(true);
  const genRes = await result;
  assert.equal(generatedItems.length, 1);
  assert.deepEqual(generatedItems[0], { label: "图1 桌面", prompt: plan.items[0].prompt.trim(), ratio: "3:4" });
  await genTool.execute("g2", plan, undefined, undefined, { ui: { confirm: async () => true } });
  assert.equal(approvals[0], approvals[1]);
  const parsedGen = JSON.parse(genRes.content[0].text) as { engine: string; items: { status: string }[] };
  assert.equal(parsedGen.engine, "bailian");
  assert.equal(parsedGen.items[0].status, "queued");
});

test("Pi 局部候选保留无关手改，找不到唯一原文时报告冲突", () => {
  const baseBody = "第一行旧开头\n\n中间重点段落\n\n结尾总结。";
  const editedByUser = "第一行旧开头\n\n中间重点段落（用户补充实测细节）\n\n结尾总结。";
  const current = { title: "当前标题", body: editedByUser, tags: ["保留标签"] };
  const resultWithEdits = {
    message: "只改开头",
    edits: [{ find: "第一行旧开头", replace: "第一行爆款钩子" }],
    before: { body: baseBody },
    patch: { body: "第一行爆款钩子\n\n中间重点段落\n\n结尾总结。" },
  };
  assert.equal(tryApplyEdits(baseBody, resultWithEdits.edits), resultWithEdits.patch.body);
  assert.deepEqual(resolvePiStagePatch(current, resultWithEdits, true), {
    body: "第一行爆款钩子\n\n中间重点段落（用户补充实测细节）\n\n结尾总结。",
  });
  assert.equal(resolvePiStagePatch({ ...current, body: "完全重写的当前正文" }, resultWithEdits, true), null);
  assert.equal(resolvePiStagePatch({ ...current, body: editedByUser + "\n第一行旧开头" }, resultWithEdits, true), null);
  assert.equal(resolvePiStagePatch(current, { ...resultWithEdits, before: undefined }, true), null);
  assert.equal(resolvePiStagePatch(current, { ...resultWithEdits, patch: { body: "不符合 edits 的整篇正文" } }, true), null);
});

test("Pi 过期整篇候选需要重生成，过期字段候选仅修改仍匹配基线的字段", () => {
  const draft = { title: "当前标题", body: "当前正文", tags: ["当前标签"] };
  const replacement = { message: "整篇改写", before: { body: draft.body }, patch: { body: "候选正文" } };
  assert.deepEqual(resolvePiStagePatch(draft, replacement, false), replacement.patch);
  assert.equal(resolvePiStagePatch(draft, replacement, true), null);
  const metadata = { message: "只改标题与标签", before: { title: draft.title, tags: draft.tags },
    patch: { title: "候选标题", tags: ["候选标签"] } };
  assert.deepEqual(resolvePiStagePatch(draft, metadata, true), metadata.patch);
  assert.equal(resolvePiStagePatch({ ...draft, title: "用户先修改了标题" }, metadata, true), null);
  assert.equal(resolvePiStagePatch({ ...draft, tags: ["用户先修改了标签"] }, metadata, true), null);
  assert.deepEqual(resolvePiStagePatch({ ...draft, ...metadata.patch }, metadata, true), metadata.patch);
});

test("isSafeSessionFile 仅允许当前草稿会话根目录下直属的 .jsonl 文件", () => {
  const dir = resolve(".creation-pi/sessions/draft-1");
  assert.equal(isSafeSessionFile(dir, join(dir, "2026-11-21_abc.jsonl")), true);
  assert.equal(isSafeSessionFile(dir, join(dir, "nested", "sub.jsonl")), false);
  assert.equal(isSafeSessionFile(dir, join(dir, "..", "escape.jsonl")), false);
  assert.equal(isSafeSessionFile(dir, resolve(".creation-pi/sessions/draft-1-evil/a.jsonl")), false);
  assert.equal(isSafeSessionFile(dir, join(dir, "notes.txt")), false);
  assert.equal(isSafeSessionFile(dir, ""), false);
});

test("ownedSessionFile 严格校验会话文件的路径、sessionId 与工作区归属", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-own-"));
  try {
    const paths = { sessions: join(root, "sessions"), workspace: join(root, "ws-a") };
    const otherWorkspace = join(root, "ws-b");
    await mkdir(paths.sessions, { recursive: true });
    await mkdir(paths.workspace, { recursive: true });
    await mkdir(otherWorkspace, { recursive: true });

    const goodFile = join(paths.sessions, "s1.jsonl");
    await writeFile(goodFile, `${JSON.stringify({ type: "session", id: "sess-1", cwd: paths.workspace })}\n`, "utf8");
    const verified = await ownedSessionFile(paths, goodFile, "sess-1");
    assert.ok(verified.endsWith("s1.jsonl"));

    // sessionId 不匹配应拒绝
    await assert.rejects(ownedSessionFile(paths, goodFile, "sess-other"), /归属|不匹配/);

    // cwd 指向其他草稿工作区应拒绝
    const foreignFile = join(paths.sessions, "s2.jsonl");
    await writeFile(foreignFile, `${JSON.stringify({ type: "session", id: "sess-2", cwd: otherWorkspace })}\n`, "utf8");
    await assert.rejects(ownedSessionFile(paths, foreignFile, "sess-2"), /工作区不匹配/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("turnForPrompt 与 validateCandidate 对自由输入统一执行范围与字段约束", () => {
  const note = {
    title: "通勤包实测",
    body: "第一段旧开头。\n\n第二段中间体验。\n\n第三段结尾总结。",
    tags: ["通勤包"],
    revision: 3,
    facts: "自重 420g",
    audience: "上班族",
    mode: "original" as const,
    topic: "通勤包",
    referenceTitle: null,
  };

  // 中栏自由输入「只改第一段」也识别为局部改稿并锁定第一段
  const localTurn = turnForPrompt("只改第一段，让开头更有代入感", "chat", note);
  assert.equal(localTurn.kind, "revise");
  assert.deepEqual(localTurn.requirements, { fields: ["body"], localEdit: true, paragraph: 1 });

  // 顺手改标题应被拦下
  assert.match(
    validateCandidate({
      patch: { title: "擅自改标题", body: "第一段新开头。\n\n第二段中间体验。\n\n第三段结尾总结。" },
      before: { body: note.body },
      edits: [{ find: "第一段旧开头。", replace: "第一段新开头。" }],
      kind: localTurn.kind,
      requirements: localTurn.requirements,
    }) ?? "",
    /范围之外/,
  );

  // 替换位置超出第一段应被拦下
  assert.match(
    validateCandidate({
      patch: { body: "第一段旧开头。\n\n第二段中间体验。\n\n第三段改了结尾。" },
      before: { body: note.body },
      edits: [{ find: "第三段结尾总结。", replace: "第三段改了结尾。" }],
      kind: localTurn.kind,
      requirements: localTurn.requirements,
    }) ?? "",
    /超出本轮指定的段落/,
  );

  // 合法的局部第一段修改通过
  assert.equal(
    validateCandidate({
      patch: { body: "第一段新开头。\n\n第二段中间体验。\n\n第三段结尾总结。" },
      before: { body: note.body },
      edits: [{ find: "第一段旧开头。", replace: "第一段新开头。" }],
      kind: localTurn.kind,
      requirements: localTurn.requirements,
    }),
    null,
  );

  // 完整起稿缺少正文/标签或包含重复标签应拒绝
  assert.match(validateCandidate({ patch: { title: "只有标题" }, kind: "generate" }) ?? "", /标题、正文和标签/);
  assert.match(
    validateCandidate({ patch: { title: "好标题", body: "完整正文", tags: ["通勤", "#通勤"] }, kind: "generate" }) ?? "",
    /非空且互不重复/,
  );
});

test("mediaArtifact 支持 6 张生图批次（含 queued/succeeded/failed）且不受长文案截断影响", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    mediaId: randomUUID(),
    runId: randomUUID(),
    label: `图${i + 1}`,
    status: i === 5 ? "failed" : i % 2 === 0 ? "succeeded" : "queued",
    ratio: "3:4",
  }));
  const artifact = mediaArtifact("call-6", "star_generate_images", {
    content: [{ type: "text", text: JSON.stringify({ engine: "bailian", items }) }],
  });
  assert.ok(artifact && artifact.kind === "media");
  assert.equal(artifact.batch.items.length, 6);
  assert.equal(artifact.batch.items[5].status, "failed");

  const stageId = randomUUID();
  const cand = mediaArtifact("call-stage", "star_stage_note", {
    content: [{ type: "text", text: JSON.stringify({ runId: stageId }) }],
  });
  assert.deepEqual(cand, { kind: "candidate", toolCallId: "call-stage", runId: stageId });
});

test("webSearch 区分查证成功、空结果与搜索服务不可用，referenceIdentity 纳入参考标签", async () => {
  const originalFetch = globalThis.fetch;
  const savedBocha = process.env.BOCHA_API_KEY;
  const savedTavily = process.env.TAVILY_API_KEY;
  delete process.env.BOCHA_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    // 全部搜索服务报错 -> unavailable
    globalThis.fetch = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const unavailable = await webSearch("通勤包自重");
    assert.equal(unavailable.status, "unavailable");
    assert.equal(unavailable.results.length, 0);

    // 服务返回明确的空结果页 -> empty
    globalThis.fetch = (async () => new Response('<div class="no-results">No results</div>', { status: 200 })) as unknown as typeof fetch;
    const empty = await webSearch("绝不存在的冷门词");
    assert.equal(empty.status, "empty");
    assert.equal(empty.results.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedBocha !== undefined) process.env.BOCHA_API_KEY = savedBocha;
    if (savedTavily !== undefined) process.env.TAVILY_API_KEY = savedTavily;
  }

  const baseRef = { reference: "正文", source: "paste" as const, referenceId: "xhs:1", referenceTitle: "原题", referenceTags: ["标签A"] };
  assert.notEqual(referenceIdentity(baseRef), referenceIdentity({ ...baseRef, referenceTags: ["标签B"] }));
});
