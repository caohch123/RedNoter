import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { ImageContent } from "@earendil-works/pi-ai";
import { ContextLimitError, contextBudget, estimateInput, prepareContext, type ContextSource } from "../server/model-context.js";
import { emptyDraft } from "../server/domain.js";
import { generate } from "../server/model.js";

const systemPrompt = "你负责整理创作素材。";
const required = { request: "请比较旅行与通勤场景", draft: "当前工作稿", facts: "只写用户确认的功能" };
function render(sources: ContextSource[], digest?: string) {
  return JSON.stringify({ required, sources, digest });
}
const sources = [
  { id: "当前附件", text: "旅行与通勤信息和背包参数。".repeat(400) },
  { id: "旧对话", text: "这里是较早的交流记录。".repeat(350) },
];
const images: ImageContent[] = [];
const window = 4096;
const maxOutput = 1200;
const relevance = "旅行 通勤";
const subject = { sources, render, systemPrompt, images, window, maxOutput, relevance };
const budget = contextBudget(window, maxOutput);

test("在预算内保留原文并跳过摘要", async () => {
  const original = [{ id: "参考", text: "读者关注的是背包容量。" }];
  const result = await prepareContext({ ...subject, sources: original, summarize: async () => assert.fail("unexpected summary") });
  assert.equal(result.prompt, render(original));
  assert.equal(result.notice, undefined);
});

test("超出预算仅摘要辅助材料一次，并保留必需内容", async () => {
  let count = 0;
  const result = await prepareContext({ ...subject, summarize: async (prompt, tokens) => {
    count++;
    assert.match(prompt, /当前附件/);
    assert.match(prompt, /旧对话/);
    assert.doesNotMatch(prompt, /当前工作稿/);
    assert.ok(estimateInput(systemPrompt, prompt) <= contextBudget(window, tokens).input);
    return JSON.stringify({ summary: "附件对比了旅行与通勤，旧对话关注背包大小。" });
  } });
  assert.equal(result.notice, "summarized");
  assert.equal(count, 1);
  assert.deepEqual(JSON.parse(result.prompt).required, required);
  assert.match(result.prompt, /附件对比了旅行与通勤/);
  assert.ok(estimateInput(systemPrompt, result.prompt) <= budget.input);
});

test("摘要失败或无效时使用有预算的本地摘录", async () => {
  for (const summarize of [async () => { throw new Error("mock unavailable"); }, async () => "{}"]) {
    const result = await prepareContext({ ...subject, summarize });
    assert.equal(result.notice, "trimmed");
    assert.deepEqual(JSON.parse(result.prompt).required, required);
    assert.ok(JSON.parse(result.prompt).sources.length);
    assert.ok(estimateInput(systemPrompt, result.prompt) <= budget.input);
  }
});

test("必需内容或图片超预算时不提交摘要请求", async () => {
  const summarize = async () => assert.fail("unexpected summary");
  await assert.rejects(prepareContext({ ...subject, summarize,
    render: () => "未修改的正文".repeat(window),
  }), ContextLimitError);
  const image: ImageContent = { type: "image", mimeType: "image/png", data: "AA==" };
  await assert.rejects(prepareContext({ ...subject, summarize, images: [image, image, image] }), ContextLimitError);
});

test("通过 Pi 先摘要再生成，且不向摘要请求重复发送完整工作稿", async () => {
  const calls: { prompt: string; maxOutput: number }[] = [];
  const fixture = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const contentInput = payload.messages.at(-1).content;
    const prompt = typeof contentInput === "string" ? contentInput : contentInput.find((part: { type: string }) => part.type === "text").text;
    calls.push({ prompt, maxOutput: payload.max_tokens ?? payload.max_completion_tokens });
    const content = JSON.stringify(calls.length === 1
      ? { summary: "参考原文详细介绍了旅行与通勤需求。" }
      : { message: "初稿已准备好。", patch: { title: "旅行和通勤", body: "旅行与通勤使用场景不同。", tags: ["旅行"] } });
    const model = payload.model;
    const chunk = { id: "fixture", object: "chat.completion.chunk", created: 1, model };
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write("data: " + JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] }) + "\n\n");
    response.end("data: " + JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    fixture.once("error", reject);
    fixture.listen(0, "127.0.0.1", resolve);
  });
  try {
    const result = await generate("generate", {
      draft: { ...emptyDraft, title: "我的背包", body: required.draft,
        settings: { ...emptyDraft.settings, topic: "旅行包", facts: required.facts, reference: "旅行与通勤的参考信息。".repeat(450) } },
      attachments: [], history: [
        { request: "必须使用用户提供的事实。", response: "已记下。" },
        { request: "写常见背包场景。", response: "可以。" },
      ],
    }, required.request, {
      provider: "openai-compatible", apiKey: "fixture-key", baseUrl: "http://127.0.0.1:" + (fixture.address() as AddressInfo).port + "/v1",
      modelId: "context-test", contextWindow: 4096,
    });
    assert.equal(result.contextNotice, "summarized");
    assert.equal(calls.length, 2);
    assert.match(calls[0].prompt, /参考笔记/);
    assert.doesNotMatch(calls[0].prompt, /当前工作稿/);
    assert.ok(calls[0].maxOutput <= 1200);
    const generated = JSON.parse(calls[1].prompt.split("\n").at(-1) ?? "");
    assert.equal(generated.input.draft.body, required.draft);
    assert.equal(generated.prompt, required.request);
    assert.deepEqual(generated.input.confirmedRequirements, ["必须使用用户提供的事实。"]);
    assert.equal(generated.input.draft.settings.facts, required.facts);
    assert.equal(generated.supportingMaterialSummary, "参考原文详细介绍了旅行与通勤需求。");
  } finally {
    fixture.close();
  }
});
