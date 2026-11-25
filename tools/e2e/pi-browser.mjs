/**
 * 阶段二验收：在中栏逐项走一遍原生网页入口。
 *
 * 跑法：node tools/e2e/pi-browser.mjs
 * 前置：web(3000)、api(3002)、pi 运行器(3013) 都在跑，且本机有 Chrome。
 * 产出：.creation-pi/e2e/*.png 与终端里的通过/失败清单。
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { env } from "node:process";
import { chromium } from "playwright-core";

const ORIGIN = env.APP_ORIGIN ?? "http://localhost:3000";
const CHROME = env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = ".creation-pi/e2e";
const results = [];
let page;
let shot = 0;

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    results.push({ name, ok: false, ms: Date.now() - started, error: message });
    console.log(`✗ ${name} — ${message}`);
    await page?.screenshot({ path: `${OUT}/fail-${++shot}.png` }).catch(() => undefined);
  }
}

const waitFor = async (fn, timeout = 180_000, interval = 500) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

async function register() {
  const username = `e2e_${randomUUID().slice(0, 8)}`;
  const response = await fetch(`${ORIGIN}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "Test12345" }),
  });
  if (response.status !== 201) throw new Error(`注册失败 ${response.status}: ${await response.text()}`);
  const pair = response.headers.getSetCookie()[0].split(";")[0];
  const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
  return { name, value, username };
}

async function createDraft(cookie) {
  const response = await fetch(`${ORIGIN}/api/v1/creation/drafts`, {
    method: "POST", headers: { cookie: `${cookie.name}=${cookie.value}`, "content-type": "application/json" },
    body: JSON.stringify({ example: true }),
  });
  if (response.status !== 201) throw new Error(`建稿失败 ${response.status}: ${await response.text()}`);
  return response.json();
}

await mkdir(OUT, { recursive: true });
const cookie = await register();
const draft = await createDraft(cookie);
console.log(`账号 ${cookie.username} 草稿 ${draft.id}`);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1500, height: 960 }, acceptDownloads: true, locale: "zh-CN" });
await context.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/" }]);
page = await context.newPage();

const eventUrls = [];
page.on("request", (request) => { if (request.url().includes("/pi/drafts/") && request.url().includes("/events")) eventUrls.push(request.url()); });
page.on("console", (message) => { if (message.type() === "error") console.log("  [console]", message.text().slice(0, 160)); });

const feed = () => page.getByRole("log", { name: "Pi 会话" });
const composer = () => page.locator('textarea[data-entry="conversation-input"]');
const send = async (text) => {
  // 忙的时候按回车会被当成「追加」，验收用例要的是新一轮，先等空闲。
  await waitFor(async () => (await page.getByRole("button", { name: "发送" }).count()) > 0, 180_000);
  await composer().fill(text);
  await composer().press("Enter");
};
const drawer = (name) => page.getByRole("dialog", { name });
const closeDrawer = async () => { await page.getByRole("button", { name: "关闭", exact: true }).last().click(); };

await page.goto(`${ORIGIN}/workspace/create?draft=${draft.id}`, { waitUntil: "domcontentloaded" });

await step("中栏加载并连上 Pi 会话", async () => {
  const ready = await waitFor(async () => {
    const badge = page.locator("header span", { hasText: /^Pi$/ }).first();
    return (await badge.count()) > 0 && (await badge.getAttribute("data-status")) === "ready";
  }, 90_000);
  if (!ready) throw new Error("60 秒内没有连上 Pi 会话");
  await page.screenshot({ path: `${OUT}/01-ready.png` });
});

await step("把思考级别调低，便于逐项验收", async () => {
  await page.getByLabel("思考级别").selectOption("low");
  await new Promise((resolve) => setTimeout(resolve, 1500));
});

// 回归：网关把左栏设置拼成了很长一段上下文，气泡里不该把它当用户的话显示；回复也不该露出 ** 这种标记。
await step("提问只显示用户自己写的话，回复按 Markdown 渲染", async () => {
  await send("用一句话回答：你好。请把「可以」两个字加粗。");
  const echoed = await waitFor(async () => (await feed().innerText()).includes("用一句话回答"), 90_000);
  if (!echoed) throw new Error("提问气泡没有出现");
  const feedText = await feed().innerText();
  if (feedText.includes("【摘星上下文】")) throw new Error("气泡里仍然显示了注入的上下文");
  const reply = page.locator('article:has(button[aria-label="复制这条回复"])').last();
  const replied = await waitFor(async () => (await page.locator('article:has(button[aria-label="复制这条回复"])').count()) > 0, 200_000);
  if (!replied) throw new Error("没有等到回复");
  const replyText = await reply.innerText();
  if (replyText.includes("**")) throw new Error("回复里露出了 Markdown 星号");
  if ((await reply.locator("strong").count()) === 0) console.log("  [提示] 这条回复没有用粗体，Markdown 渲染未取到样");
  await page.screenshot({ path: `${OUT}/02-chat.png` });
});

await step("工具流 + 扩展对话框（star_note_snapshot / star_confirm_plan）", async () => {
  await send("先调用 star_note_snapshot 读一下当前草稿，然后用 star_confirm_plan 给我一个两步改稿计划。不要直接改稿。");
  const tool = page.getByText("读取草稿").first();
  if (!(await waitFor(async () => (await tool.count()) > 0, 200_000))) throw new Error("没有出现工具调用卡片");
  // 卡片的 aria-label 来自扩展给的标题，不一定是「需要确认」，按按钮反查更稳。
  const card = page.locator('[role="group"]').filter({ has: page.getByRole("button", { name: "确认", exact: true }) }).first();
  if (!(await waitFor(async () => (await card.count()) > 0, 120_000))) throw new Error("没有出现计划确认卡片");
  await page.screenshot({ path: `${OUT}/02-plan-dialog.png` });
  await card.getByRole("button", { name: "确认", exact: true }).click();
  // 卡片消失、且助手继续把话说完，说明确认结果回到了模型手里。
  const gone = await waitFor(async () => (await card.count()) === 0, 30_000);
  if (!gone) throw new Error("确认后卡片没有关闭");
  const settled = await waitFor(async () => (await page.getByRole("button", { name: "发送" }).count()) > 0, 200_000);
  if (!settled) throw new Error("确认后模型没有继续执行完");
});

await step("联网授权卡片（拒绝后命令被拦下）", async () => {
  await send("用 bash 工具执行 curl -s -o /dev/null -w \"%{http_code}\" https://example.com 并告诉我输出。必须真的执行。");
  const guard = page.getByRole("group", { name: "允许这次联网吗？" });
  if (!(await waitFor(async () => (await guard.count()) > 0, 120_000))) throw new Error("没有出现联网授权卡片");
  await page.screenshot({ path: `${OUT}/03-network-guard.png` });
  await guard.getByRole("button", { name: "不同意" }).click();
  const blocked = await waitFor(async () => /没有授权联网|拦下|被拦截|没有真正执行/.test(await feed().innerText()), 90_000);
  if (!blocked) throw new Error("拒绝后没有看到被拦下的说明");
});

// 让 Pi 卡在「等用户确认」上，执行状态就是确定的，插话和停止才好验。
const blockOnPlan = async () => {
  await send("请用 star_confirm_plan 让我确认一个三步计划：先改标题、再改正文、最后换标签。等我确认后再继续。");
  const stop = page.getByRole("button", { name: "停止" });
  if (!(await waitFor(async () => (await stop.count()) > 0, 60_000))) throw new Error("没有进入执行状态");
};

await step("插话（steer）", async () => {
  await blockOnPlan();
  await composer().fill("补一句：正文里保留原来的数字清单结构。");
  await page.getByRole("button", { name: "插话" }).click({ timeout: 10_000 });
  const queued = await waitFor(async () => (await page.getByText(/插话 · /).count()) > 0, 20_000);
  await page.screenshot({ path: `${OUT}/04-steer.png` });
  if (!queued) throw new Error("插话没有进入队列");
});

await step("停止（abort）", async () => {
  const stop = page.getByRole("button", { name: "停止" });
  if (!(await waitFor(async () => (await stop.count()) > 0, 20_000))) throw new Error("没有可停止的任务");
  await stop.click();
  const idle = await waitFor(async () => (await page.getByRole("button", { name: "发送" }).count()) > 0, 60_000);
  if (!idle) throw new Error("停止后没有回到可发送状态");
  await page.screenshot({ path: `${OUT}/05-stop.png` });
});

await step("复制上一条回复（/copy）", async () => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  const copy = page.getByRole("button", { name: "复制这条回复" }).last();
  if (!(await waitFor(async () => (await copy.count()) > 0, 20_000))) throw new Error("没有复制按钮");
  await copy.click();
  const notice = await waitFor(async () => (await page.getByText("已复制这条回复").count()) > 0, 12_000);
  if (!notice) throw new Error("没有出现复制提示");
});

let jsonlPath = null;
await step("导出 JSONL（/export）", async () => {
  await page.getByRole("button", { name: "会话", exact: true }).first().click();
  const panel = drawer("会话");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 40_000 }), panel.getByRole("button", { name: "导出 JSONL" }).click()]);
  jsonlPath = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(jsonlPath);
  const first = (await import("node:fs")).readFileSync(jsonlPath, "utf8").split("\n")[0];
  if (!JSON.parse(first).type) throw new Error("导出的文件不是会话 JSONL");
});

await step("导出 HTML（/export）", async () => {
  const panel = drawer("会话");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 40_000 }), panel.getByRole("button", { name: "导出 HTML" }).click()]);
  const path = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(path);
  const html = (await import("node:fs")).readFileSync(path, "utf8");
  if (!html.includes("<section class=\"turn")) throw new Error("HTML 里没有对话块");
});

await step("导入会话 JSONL（/import）", async () => {
  const panel = drawer("会话");
  await panel.locator('input[data-entry="pi-import"]').setInputFiles(jsonlPath);
  const done = await waitFor(async () => /已导入/.test(await page.innerText("body")), 40_000);
  if (!done) throw new Error("导入后没有提示");
  await page.screenshot({ path: `${OUT}/05-import.png` });
  await closeDrawer();
});

await step("命令面板：技能填写与重载（/skill:、/reload）", async () => {
  await page.getByRole("button", { name: "命令面板" }).click();
  const panel = drawer("命令面板");
  await panel.getByText(/技能（\d+）/).waitFor({ timeout: 20_000 });
  const fill = panel.getByRole("button", { name: "填入" }).first();
  if (!(await fill.count())) throw new Error("命令面板里没有可填写的技能");
  await fill.click();
  const value = await composer().inputValue();
  if (!/^\/skill:/.test(value)) throw new Error(`填入后输入框是 ${value}`);
  await page.screenshot({ path: `${OUT}/06-palette.png` });
  await page.getByRole("button", { name: "命令面板" }).click();
  await drawer("命令面板").getByRole("button", { name: "重载技能与模板" }).click();
  if (!(await waitFor(async () => /已重载/.test(await page.innerText("body")), 20_000))) throw new Error("重载没有提示");
  await composer().fill("");
  await closeDrawer();
});

await step("断线续传（刷新后按 seq 续接）", async () => {
  await send("用三句话讲讲你会怎么改这篇笔记的开头，然后停下。");
  await waitFor(async () => (await page.getByRole("button", { name: "停止" }).count()) > 0, 20_000);
  const before = eventUrls.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  const ready = await waitFor(async () => {
    const badge = page.locator("header span", { hasText: /^Pi$/ }).first();
    return (await badge.count()) > 0 && (await badge.getAttribute("data-status")) === "ready";
  }, 90_000);
  if (!ready) throw new Error("刷新后没连上");
  const resumed = eventUrls.slice(before).some((url) => /after=[1-9]\d*/.test(url));
  const history = (await feed().innerText()).length > 20;
  await page.screenshot({ path: `${OUT}/07-resume.png` });
  if (!history) throw new Error("刷新后历史消息丢了");
  if (!resumed) throw new Error("重连没有带上 seq（after=0）");
});

await step("终端专属扩展（/desk 只能在网页终端里跑）", async () => {
  // 以运行器状态为准：DOM 上的按钮只反映最后一次推送，会话可能还在执行。
  const stateOf = async () => {
    const response = await page.request.get(`${ORIGIN}/api/v1/creation/pi/drafts/${draft.id}/state`);
    return (await response.json()).state;
  };
  if (!(await waitFor(async () => !(await stateOf()).busy, 180_000))) {
    // 模型这一轮可能特别长，按用户的处理方式先停一次再看。
    const stopButton = page.getByRole("button", { name: "停止" });
    if (await stopButton.count()) await stopButton.first().click();
    if (!(await waitFor(async () => !(await stateOf()).busy, 60_000))) throw new Error("会话始终在执行，终端无法接管");
  }
  // 先真的闲下来：发送按钮在、停止按钮不在，连续两秒都这样。
  await waitFor(async () => {
    const idle = (await page.getByRole("button", { name: "发送" }).count()) > 0
      && (await page.getByRole("button", { name: "停止" }).count()) === 0;
    if (!idle) return false;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return (await page.getByRole("button", { name: "停止" }).count()) === 0;
  }, 120_000);

  await page.getByRole("button", { name: "网页终端" }).click();
  await page.getByRole("button", { name: "接管终端" }).click();

  const takeover = page.getByRole("button", { name: "停止并接管" });
  if (await waitFor(async () => (await takeover.count()) > 0, 10_000)) {
    await takeover.click();
    console.log("  （会话当时在执行，走了「停止并接管」）");
    if (!(await waitFor(async () => !(await stateOf()).busy, 30_000))) throw new Error("停止后会话仍在执行");
  }

  const screen = page.locator(".xterm");
  let up = await waitFor(async () => (await screen.count()) > 0, 60_000);
  for (let attempt = 0; attempt < 2 && !up; attempt++) {
    const retry = page.getByRole("button", { name: "重试" });
    if (await retry.count()) await retry.first().click();
    up = await waitFor(async () => (await screen.count()) > 0, 60_000);
  }
  if (!up) throw new Error("终端没有起来");

  const mirror = page.locator('[data-entry="terminal-text"]');
  // 等 TUI 真正画出第一屏，再把命令敲进去，否则按键会掉进启动过程里。
  let painted = await waitFor(async () => (await mirror.innerText()).trim().length > 20, 60_000);
  if (!painted) {
    const retry = page.getByRole("button", { name: "重试" });
    if (await retry.count()) await retry.first().click();
    painted = await waitFor(async () => (await mirror.innerText()).trim().length > 20, 60_000);
  }
  if (!painted) throw new Error("终端没有画出界面");

  await screen.click();
  // TUI 画完第一屏之后还要一点时间才把扩展命令挂上，敲早了 /desk 会被当成普通消息发给模型。
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const typeDesk = async () => {
    await page.keyboard.press("Control+u");
    await page.keyboard.type("/desk");
    await page.keyboard.press("Enter");
    return waitFor(async () => (await mirror.innerText()).includes("终端便签"), 25_000);
  };
  let desk = await typeDesk();
  if (!desk) {
    await page.keyboard.press("Escape");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    desk = await typeDesk();
  }
  await page.screenshot({ path: `${OUT}/08-terminal-desk.png` });
  if (!desk) throw new Error(`终端里没有出现 /desk 面板：${JSON.stringify((await mirror.innerText()).slice(-160))}`);
  await page.keyboard.press("q");
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

await step("关闭终端后会话交回网页", async () => {
  await closeDrawer();
  const ready = await waitFor(async () => {
    const badge = page.locator("header span", { hasText: /^Pi$/ }).first();
    return (await badge.count()) > 0 && (await badge.getAttribute("data-status")) === "ready";
  }, 90_000);
  if (!ready) throw new Error("关闭终端后网页会话没有恢复");
  await page.screenshot({ path: `${OUT}/09-back-to-web.png` });
});

await step("能力对照抽屉读到同一份数据", async () => {
  await page.getByRole("button", { name: "能力对照" }).click();
  const panel = drawer("Pi 能力对照");
  const text = await panel.innerText();
  if (!/共 \d+ 项/.test(text)) throw new Error("能力表没有加载");
  if (!text.includes("联网前逐个目标授权")) throw new Error("能力表里缺少联网授权项");
  await page.screenshot({ path: `${OUT}/10-capabilities.png` });
  await closeDrawer();
});

await writeFile(`${OUT}/results.json`, JSON.stringify({ draftId: draft.id, account: cookie.username, results }, null, 2));
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) { for (const item of failed) console.log(`  ✗ ${item.name}: ${item.error}`); }
await browser.close();
process.exit(failed.length ? 1 : 0);
