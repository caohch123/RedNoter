import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Part = { type?: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: unknown };
type Message = { role?: string; content?: unknown; toolCallId?: string; isError?: boolean };

const escape = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const textOf = (message: Message) => {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return (message.content as Part[]).flatMap((part) => (part?.type === "text" ? [part.text ?? ""] : [])).join("\n");
};

const thinkingOf = (message: Message) => {
  if (!Array.isArray(message.content)) return "";
  return (message.content as Part[]).flatMap((part) => (part?.type === "thinking" ? [part.thinking ?? ""] : [])).join("\n");
};

const callsOf = (message: Message) => Array.isArray(message.content)
  ? (message.content as Part[]).flatMap((part) => (part?.type === "toolCall"
    ? [{ id: String(part.id ?? ""), name: String(part.name ?? ""), args: part.arguments }] : []))
  : [];

export type ExportMeta = { draftId: string; title: string; sessionId: string; model: string | null; exportedAt: string };

/** 把会话渲染成单文件 HTML：自带样式、无外部资源，便于直接发给别人看。 */
export function renderSessionHtml(messages: Message[], meta: ExportMeta) {
  const results = new Map<string, { text: string; error: boolean }>();
  for (const message of messages) {
    if (message.role !== "toolResult") continue;
    const body = Array.isArray(message.content)
      ? (message.content as Part[]).map((part) => part.text ?? "").join("\n") : "";
    results.set(String(message.toolCallId ?? ""), { text: body, error: Boolean(message.isError) });
  }

  const blocks = messages.flatMap((message) => {
    if (message.role === "system" || message.role === "toolResult") return [];
    if (message.role === "user") {
      return [`<section class="turn user"><h3>用户</h3><p>${escape(textOf(message)).replace(/\n/g, "<br>")}</p></section>`];
    }
    if (message.role !== "assistant") return [];
    const thinking = thinkingOf(message);
    const body = textOf(message);
    const calls = callsOf(message).map((call) => {
      const result = results.get(call.id);
      return `<details class="tool"><summary>${escape(call.name)}${result?.error ? " · 失败" : ""}</summary>`
        + `<pre class="args">${escape(JSON.stringify(call.args, null, 2))}</pre>`
        + (result ? `<pre class="out">${escape(result.text.slice(0, 8000))}</pre>` : "")
        + "</details>";
    }).join("");
    return [`<section class="turn assistant"><h3>Pi</h3>`
      + (thinking ? `<details class="thinking"><summary>思考过程</summary><pre>${escape(thinking)}</pre></details>` : "")
      + calls
      + (body ? `<p>${escape(body).replace(/\n/g, "<br>")}</p>` : "")
      + "</section>"];
  });

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(meta.title)} · Pi 会话</title>
<style>
:root{color-scheme:light dark}
body{margin:0;padding:40px 20px;font:16px/1.7 -apple-system,"Segoe UI","Noto Sans SC",system-ui,sans-serif;background:#f6f6f4;color:#1c1c1a}
main{max-width:760px;margin:0 auto}
header{border-bottom:1px solid #dcdcd6;padding-bottom:16px;margin-bottom:24px}
h1{font-size:22px;margin:0 0 8px}
.meta{font-size:13px;color:#6b6b63}
.turn{background:#fff;border:1px solid #e3e3dd;border-radius:12px;padding:14px 18px;margin:0 0 14px}
.turn.user{background:#f0f4ff;border-color:#d5def7}
.turn h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b63;margin:0 0 6px}
.turn p{margin:0;white-space:pre-wrap}
details{margin:8px 0;font-size:14px}
summary{cursor:pointer;color:#4b5bd6}
pre{background:#f2f2ee;border-radius:8px;padding:10px;overflow:auto;max-height:360px;font-size:13px}
.tool{border-left:3px solid #d9d9d2;padding-left:10px}
footer{margin-top:32px;font-size:12px;color:#8a8a80;text-align:center}
</style></head>
<body><main>
<header><h1>${escape(meta.title)}</h1>
<p class="meta">Pi ${escape(meta.model ?? "会话")} · 会话 ${escape(meta.sessionId)} · 导出 ${escape(meta.exportedAt)}</p></header>
${blocks.join("\n")}
<footer>由摘星创作台导出</footer>
</main></body></html>`;
}

export async function readSessionJsonl(file: string) {
  const content = await readFile(file, "utf8");
  return content;
}

export type ImportCheck = { ok: true; sessionId: string } | { ok: false; message: string };

/** 只接受 Pi 自己的会话 JSONL：首行必须是 session 头，且带 id 与版本。 */
export function checkSessionJsonl(content: string): ImportCheck {
  if (content.length > 24 * 1024 * 1024) return { ok: false, message: "会话文件超过 24 MB" };
  const first = content.split("\n").find((line) => line.trim().length > 0);
  if (!first) return { ok: false, message: "文件是空的" };
  let head: { type?: string; id?: string; version?: number };
  try {
    head = JSON.parse(first) as { type?: string; id?: string; version?: number };
  } catch {
    return { ok: false, message: "首行不是合法 JSON，可能不是 Pi 会话文件" };
  }
  if (head.type !== "session" || !head.id) return { ok: false, message: "缺少 Pi 会话头（type=session），无法作为会话导入" };
  return { ok: true, sessionId: head.id };
}

export function importTarget(dir: string, sessionId: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = sessionId.replace(/[^0-9a-zA-Z-]/g, "").slice(0, 40) || randomUUID();
  return join(dir, `${stamp}_${safe}.jsonl`);
}

export async function writeImport(dir: string, content: string) {
  const check = checkSessionJsonl(content);
  if (!check.ok) throw new Error(check.message);
  await mkdir(dir, { recursive: true });
  const path = importTarget(dir, check.sessionId);
  await writeFile(path, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
  return { path, sessionId: check.sessionId, sha256: createHash("sha256").update(content).digest("hex").slice(0, 16) };
}
