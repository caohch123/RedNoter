/**
 * 质量回归：原创 → 局部改稿 → 应用 → 定稿，跑两组不同的数字。
 *
 * 与 pi-browser.mjs 不同，这里关心的是「稿子对不对」，不只是流程通不通：
 *   1. 模型实际收到的输入里有没有用户确认的事实和最新人群；
 *   2. 候选稿有没有用上事实、有没有编造没依据的细节；
 *   3. 说「只改开头」时，范围外的段落是不是逐字没变；
 *   4. 生成期间用户手动改稿，应用旧候选时会不会冲突、人工修改会不会丢；
 *   5. 换一组数字再跑一遍，上一稿的事实不能漏进这一稿。
 *
 * 跑法：node tools/e2e/pi-quality.mjs
 * 产出：.creation-pi/quality/report.json 与终端里的指标表。
 * 结构性问题直接失败（退出码 1）；事实命中、无依据陈述这类跟模型表现相关的只记录。
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { env } from "node:process";

const ORIGIN = env.APP_ORIGIN ?? "http://localhost:3000";
const BASE = `${ORIGIN}/api/v1/creation`;
const ROOT = env.PI_ROOT ?? ".creation-pi";
const OUT = ".creation-pi/quality";

/** 事实里没有、正文不该自己编的说法。 */
const UNSUPPORTED = ["拉链", "实测", "价格", "元", "保修", "售后", "肩带压力"];

/** 带单位的数字：正文里出现就必须在事实或补充要求里找得到依据，用来做「逐句核对」的入口。 */
const NUMBER_UNIT = /(\d+(?:\.\d+)?)\s*(寸|英寸|个|层|元|块|克|毫升|升|天|次|小时|分钟|年|cm|mm|kg|ml)/gi;

function unbackedNumbers(body, sources) {
  const text = sources.join("\n").replace(/\s+/g, "");
  const found = new Set();
  for (const match of body.matchAll(NUMBER_UNIT)) {
    const token = `${match[1]}${match[2]}`.toLowerCase();
    if (text.toLowerCase().includes(token)) continue;
    found.add(match[0].replace(/\s+/g, ""));
  }
  return [...found];
}

const SCENARIOS = [
  {
    name: "第一组",
    facts: ["能放 13 寸电脑", "有两个内袋"],
    /** 正文里认定「用上了这条事实」的说法：上下文不同措辞会变，只要信息点还在就算命中。 */
    probes: [["13 寸", "13寸"], ["两个内袋", "2 个内袋", "2个内袋", "两个侧袋", "2 个侧袋"]],
    audience: "早八通勤族",
    topic: "轻量通勤托特包",
    category: "通勤箱包",
    forbidden: [],
    manual: (body) => body.replace("两个内袋", "三个内袋"),
    manualProbe: "三个内袋",
    manualLabel: "把「两个内袋」改成「三个内袋」",
  },
  {
    name: "第二组",
    facts: ["能放 15 寸电脑", "有三个外层袋"],
    probes: [["15 寸", "15寸"], ["三个外层袋", "3 个外层袋", "3个外层袋", "三个外袋", "3 个外袋"]],
    audience: "周末短途出行",
    topic: "周末短途双肩包",
    category: "双肩包",
    forbidden: ["13 寸", "13寸", "两个内袋", "早八通勤族"],
    manual: (body) => `${body}\n\n〔人工补充：周末背了两次，包型没塌〕`,
    manualProbe: "周末背了两次",
    manualLabel: "手工补一句使用感受",
  },
];

const results = [];
const metrics = { factHits: [], unsupportedHits: [], unbacked: [], outOfScopeDiffs: [], lengths: [] };
let scope = "";

const check = (name, condition, detail = "") => {
  const label = scope ? `[${scope}] ${name}` : name;
  results.push({ name: label, ok: Boolean(condition), detail });
  console.log(`${condition ? "✓" : "✗"} ${label}${condition ? "" : ` — ${detail}`}`);
  if (!condition) throw new Error(`${label}${detail ? `：${detail}` : ""}`);
};

const note = (name, detail) => {
  const label = scope ? `[${scope}] ${name}` : name;
  results.push({ name: label, ok: true, detail, soft: true });
  console.log(`· ${label}${detail ? ` — ${detail}` : ""}`);
};

async function register() {
  const username = `q_${randomUUID().slice(0, 8)}`;
  const response = await fetch(`${ORIGIN}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "Test12345" }),
  });
  if (response.status !== 201) throw new Error(`注册失败 ${response.status}: ${await response.text()}`);
  const pair = response.headers.getSetCookie()[0].split(";")[0];
  return { username, cookie: pair };
}

function client(cookie) {
  return async (path, { method = "GET", body, status = 200 } = {}) => {
    const response = await fetch(`${BASE}${path}`, {
      method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (response.status !== status) {
      throw new Error(`${method} ${path} 期望 ${status}，实际 ${response.status}：${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeout = 180_000, interval = 500) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await sleep(interval);
  }
}

/** 从运行器事件日志里取「模型实际收到的提示」，也就是这一轮的用户消息全文。 */
async function promptText(draftId, since) {
  const file = `${ROOT}/events/${draftId}.jsonl`;
  const raw = await readFile(file, "utf8").catch(() => "");
  const lines = raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  for (const record of lines.slice().reverse()) {
    if (record.type !== "session") continue;
    if (Number(record.at) < since) continue;
    const inner = record.data?.event;
    if (inner?.type !== "message_end") continue;
    const message = inner.message;
    if (message?.role !== "user") continue;
    const content = message.content;
    return Array.isArray(content)
      ? content.flatMap((part) => (part?.type === "text" ? [part.text] : [])).join("\n")
      : String(content ?? "");
  }
  return null;
}

/** 这一轮模型是不是已经读过稿了。人工改动要卡在读稿之后，才是真的版本交错。 */
async function sawSnapshot(draftId, since) {
  const raw = await readFile(`${ROOT}/events/${draftId}.jsonl`, "utf8").catch(() => "");
  const lines = raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return lines.some((record) => {
    if (record.type !== "session" || Number(record.at) < since) return false;
    const inner = record.data?.event;
    if (inner?.type !== "message_end" || inner.message?.role !== "assistant") return false;
    return (inner.message.content ?? []).some((part) => part?.type === "toolCall" && part.name === "star_note_snapshot");
  });
}

/** 等会话真正空下来：候选出现时模型可能还在收尾，此时发新消息会被 session busy 挡掉。 */
async function idle(api, draftId) {
  return waitFor(async () => {
    const snapshot = await api(`/pi/drafts/${draftId}/state`).catch(() => null);
    return snapshot?.state && !snapshot.state.busy ? snapshot : null;
  }, 120_000, 400);
}

async function candidate(api, draftId, since) {
  return waitFor(async () => {
    const detail = await api(`/drafts/${draftId}`);
    return detail.runs.find((run) => run.result?.patch && new Date(run.createdAt).getTime() >= since) ?? null;
  });
}

const paragraphs = (body) => body.split(/\r?\n[^\S\r\n]*\r?\n/u);
const tail = (body) => paragraphs(body).slice(1).join("\n\n");

function firstDiff(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return `第 ${index} 字起：「${left.slice(index, index + 12).join("")}」→「${right.slice(index, index + 12).join("")}」`;
    }
  }
  return "未定位到差异";
}

await mkdir(OUT, { recursive: true });
const account = await register();
const api = client(account.cookie);
console.log(`账号 ${account.username}`);

for (const config of SCENARIOS) {
scope = config.name;
try {
const created = await api("/drafts", { method: "POST", body: { example: false }, status: 201 });
const draftId = created.id;
const data = {
  ...created.data,
  settings: {
    ...created.data.settings,
    mode: "original",
    topic: config.topic,
    category: config.category,
    facts: config.facts.join("\n"),
    audience: config.audience,
    instructions: "",
  },
};
let draft = await api(`/drafts/${draftId}`, { method: "PATCH", body: { revision: created.revision, data } });
console.log(`\n${config.name}：草稿 ${draftId} 版本 ${draft.revision}`);
await api(`/pi/drafts/${draftId}/open`, { method: "POST", body: {} });

/** 应用候选，拿回应用后的草稿。 */
async function apply(runId, revision) {
  await api(`/runs/${runId}/apply`, { method: "POST", body: { revision } });
  return api(`/drafts/${draftId}`);
}

// ---------- 1. 原创：模型收到什么 ----------
const start1 = Date.now();
await api(`/pi/drafts/${draftId}/prompt`, {
  method: "POST",
  body: { text: "按当前创作设置生成一篇完整笔记。", mode: "send", requestId: randomUUID(), kind: "generate" },
});
const composed = await waitFor(() => promptText(draftId, start1), 120_000);
check("模型收到了提示", Boolean(composed), "事件日志里没有这一轮的用户消息");
for (const fact of config.facts) check(`提示里带上了事实「${fact}」`, composed.includes(fact));
check(`提示里带上了人群「${config.audience}」`, composed.includes(config.audience));
check(`提示里带上了草稿版本 ${draft.revision}`, composed.includes(`草稿版本 ${draft.revision}`));
check("事实段被标成唯一依据", composed.includes("用户确认的事实"));
for (const stale of config.forbidden) check(`提示里没有上一组的值「${stale}」`, !composed.includes(stale));

const first = await candidate(api, draftId, start1);
check("生成了候选稿", Boolean(first), "120 秒内没有候选");
const body1 = first.result.patch.body ?? "";
metrics.lengths.push({ stage: `${config.name}·原创`, chars: Array.from(body1).length });
check("候选正文有实质内容", Array.from(body1).length >= 150, `只有 ${Array.from(body1).length} 字`);
const hit = config.facts.filter((_, index) =>
  config.probes[index].some((probe) => body1.includes(probe) || (first.result.patch.title ?? "").includes(probe)));
metrics.factHits.push({ stage: `${config.name}·原创`, hits: hit });
metrics.unsupportedHits.push({ stage: `${config.name}·原创`, hits: UNSUPPORTED.filter((word) => body1.includes(word)) });
note("原创事实命中", `${hit.length}/${config.facts.length}`);
note("原创可疑陈述", metrics.unsupportedHits.at(-1).hits.join("、") || "无");
const unbacked = unbackedNumbers(body1, [config.facts.join("\n"), config.topic, config.category]);
metrics.unbacked.push({ stage: `${config.name}·原创`, items: unbacked });
note("无依据数字（需人工复核）", unbacked.join("、") || "无");
for (const stale of config.forbidden) check(`正文里没有上一组的值「${stale}」`, !body1.includes(stale));

draft = await apply(first.id, draft.revision);
check("候选能写回草稿", Boolean(draft.data.body) && draft.data.body.length > 100);
check("写回后正文仍是候选正文", draft.data.body === body1);

// ---------- 2. 局部改稿：范围外逐字不变 ----------
const before = draft.data.body;
check("会话已空闲，可以继续改稿", Boolean(await idle(api, draftId)), "会话一直处于执行状态");
const start2 = Date.now();
await api(`/pi/drafts/${draftId}/prompt`, {
  method: "POST",
  body: {
    text: "只改开头：把第一段换成「这周出门基本只背它，通勤路上腾得出手」。其余每个字都别动，标题和标签也不动。",
    mode: "send", requestId: randomUUID(), kind: "revise",
  },
});
const second = await candidate(api, draftId, start2);
check("局部改稿生成了候选", Boolean(second), "120 秒内没有候选");
const patch = second.result.patch;
check("只说改开头时没顺手改标题", patch.title === undefined);
check("只说改开头时没顺手改标签", patch.tags === undefined);
const body2 = patch.body ?? "";
metrics.outOfScopeDiffs.push({ stage: config.name, before: tail(before), after: tail(body2), same: tail(before) === tail(body2) });
metrics.lengths.push({ stage: `${config.name}·局部改稿`, chars: Array.from(body2).length });
check("第一段确实变了", paragraphs(body2)[0] !== paragraphs(before)[0]);
check("范围外的段落逐字未变", tail(body2) === tail(before),
  `从第 2 段起有差异：${firstDiff(tail(before), tail(body2))}`);
check("局部改稿也仍然基于同一版本", second.baseRevision === draft.revision,
  `候选基于版本 ${second.baseRevision}，草稿版本 ${draft.revision}`);

draft = await apply(second.id, draft.revision);
check("局部改稿写回后范围外仍然未变", tail(draft.data.body) === tail(before));

// ---------- 3. 生成期间人工改稿 ----------
check("会话已空闲，可以继续改稿", Boolean(await idle(api, draftId)), "会话一直处于执行状态");
const start3 = Date.now();
await api(`/pi/drafts/${draftId}/prompt`, {
  method: "POST",
  body: {
    text: "把最后一段最后一句改得克制一点，别用「赢了」这种说法。其余每个字都别动，标题和标签也不动。",
    mode: "send", requestId: randomUUID(), kind: "revise",
  },
});
// 等模型先读一次稿，再让用户手改：这样候选一定基于旧版本，才是真实的版本交错。
const readFirst = await waitFor(() => sawSnapshot(draftId, start3), 120_000, 400);
check("模型这一轮先读了稿，人工修改发生在读稿之后", Boolean(readFirst), "120 秒内没看到读稿动作");
const manualBody = config.manual(draft.data.body);
check(`${config.manualLabel}（人工改动生效）`, manualBody !== draft.data.body, "正文里找不到可替换的位置");
const manual = await api(`/drafts/${draftId}`, {
  method: "PATCH", body: { revision: draft.revision, data: { ...draft.data, body: manualBody } },
});
check("人工保存产生了新版本", manual.revision > draft.revision, `版本仍是 ${manual.revision}`);
const third = await candidate(api, draftId, start3);
check("并发场景下候选仍然生成", Boolean(third), "120 秒内没有候选");
check("候选绑定的是人工修改前的版本", third.baseRevision === draft.revision && third.baseRevision < manual.revision,
  `候选基于 ${third.baseRevision}，人工版本 ${manual.revision}`);
let conflict = null;
try {
  await api(`/runs/${third.id}/apply`, { method: "POST", body: { revision: manual.revision } });
} catch (error) {
  conflict = error instanceof Error ? error.message : String(error);
}
check("基于旧版本的候选应用时被拦下", /409|REVISION/.test(String(conflict)), String(conflict).slice(0, 160));
const afterConflict = await api(`/drafts/${draftId}`);
check(`人工修改保住了`, afterConflict.data.body.includes(config.manualProbe), "人工改动被覆盖了");
check("候选仍在，可供对照", afterConflict.runs.some((run) => run.id === third.id && run.appliedRevision === null),
  `候选 ${third.id}；草稿里的候选：${afterConflict.runs.filter((run) => run.result?.patch)
    .map((run) => `${run.id}(${run.status}/${String(run.appliedRevision)})`).join("，") || "无"}`);

// ---------- 4. 定稿 ----------
let ready = afterConflict;
if (!ready.data.title.trim()) {
  ready = await api(`/drafts/${draftId}`, {
    method: "PATCH",
    body: { revision: ready.revision, data: { ...ready.data, title: "通勤包随手记" } },
  });
}
const checks = await api(`/drafts/${draftId}/checks`);
note("定稿检查", `错误 ${checks.errors.length} 条，提醒 ${checks.warnings.length} 条`);
const final = await api(`/drafts/${draftId}/finalizations`, { method: "POST", body: { revision: ready.revision }, status: 201 });
check("能定稿", Boolean(final.finalizationId));
metrics.drafts = [...(metrics.drafts ?? []), { scenario: config.name, draftId }];
} catch (error) {
  console.log(`\n✗ [${config.name}] ${error instanceof Error ? error.message : String(error)}`);
}
}

{
  metrics.summary = {
    factHits: metrics.factHits,
    unsupportedHits: metrics.unsupportedHits,
    unbacked: metrics.unbacked,
    outOfScopeDiffs: metrics.outOfScopeDiffs.filter((item) => !item.same).length,
    lengths: metrics.lengths,
  };
  await writeFile(`${OUT}/report.json`, JSON.stringify({ account: account.username, drafts: metrics.drafts ?? [], results, metrics }, null, 2));
  console.log("\n指标：");
  console.log(`  指定事实命中 ${metrics.factHits.map((item) => `${item.stage} ${item.hits.length}`).join("，") || "（没有候选）"}`);
  console.log(`  无依据陈述 ${metrics.unsupportedHits.map((item) => `${item.stage} ${item.hits.length}`).join("，") || "（没有候选）"}`);
  console.log(`  无依据数字 ${metrics.unbacked.map((item) => `${item.stage} ${item.items.length ? item.items.join("/") : "0"}`).join("，") || "（没有候选）"}`);
  console.log(`  修改范围外差异 ${metrics.summary.outOfScopeDiffs} 处`);
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过，报告 ${OUT}/report.json`);
  if (failed.length) {
    for (const item of failed) console.log(`  ✗ ${item.name}${item.detail ? `：${item.detail}` : ""}`);
    process.exitCode = 1;
  }
}
