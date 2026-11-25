import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { imageType } from "./media.js";

const execFileAsync = promisify(execFile);

export const cardWidth = 1080;
export const cardHeight = 1440;

export const cardThemeSchema = z.enum(["cream", "mint", "ink", "night"]);
export type CardTheme = z.infer<typeof cardThemeSchema>;

const vocabSpecSchema = z.object({
  template: z.literal("vocab"),
  theme: cardThemeSchema.default("cream"),
  badge: z.string().trim().min(1).max(40).optional(),
  word: z.string().trim().min(1).max(80),
  phonetic: z.string().trim().min(1).max(80).optional(),
  pos: z.string().trim().min(1).max(30).optional(),
  meaning: z.string().trim().min(1).max(160),
  example: z.string().trim().min(1).max(260).optional(),
  exampleZh: z.string().trim().min(1).max(260).optional(),
  tip: z.string().trim().min(1).max(200).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
});

const listSpecSchema = z.object({
  template: z.literal("list"),
  theme: cardThemeSchema.default("cream"),
  badge: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().min(1).max(140).optional(),
  items: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    detail: z.string().trim().min(1).max(180).optional(),
    tag: z.string().trim().min(1).max(24).optional(),
  })).min(1).max(8),
  footer: z.string().trim().min(1).max(60).optional(),
});

const compareSpecSchema = z.object({
  template: z.literal("compare"),
  theme: cardThemeSchema.default("cream"),
  badge: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(80),
  left: z.object({
    label: z.string().trim().min(1).max(40),
    items: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  }),
  right: z.object({
    label: z.string().trim().min(1).max(40),
    items: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  }),
  conclusion: z.string().trim().min(1).max(180).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
});

const quoteSpecSchema = z.object({
  template: z.literal("quote"),
  theme: cardThemeSchema.default("cream"),
  badge: z.string().trim().min(1).max(40).optional(),
  quote: z.string().trim().min(1).max(240),
  author: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().min(1).max(180).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
});

const htmlSpecSchema = z.object({
  template: z.literal("html"),
  theme: cardThemeSchema.default("cream"),
  label: z.string().trim().min(1).max(60).optional(),
  html: z.string().trim().min(1).max(30_000),
  css: z.string().max(15_000).optional(),
});

export const cardSpecSchema = z.discriminatedUnion("template", [
  vocabSpecSchema,
  listSpecSchema,
  compareSpecSchema,
  quoteSpecSchema,
  htmlSpecSchema,
]);

export type CardSpec = z.infer<typeof cardSpecSchema>;

interface Palette {
  bg: string;
  bgAccent: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  border: string;
  quoteBg: string;
}

const palettes: Record<CardTheme, Palette> = {
  cream: {
    bg: "#FAF7F2",
    bgAccent: "#F2EAE0",
    surface: "#FFFFFF",
    ink: "#1F1D1A",
    muted: "#6B645B",
    accent: "#D95F43",
    accentSoft: "#FBECE7",
    border: "#E8DFD3",
    quoteBg: "#F7F3EC",
  },
  mint: {
    bg: "#F2F7F4",
    bgAccent: "#E2EFE7",
    surface: "#FFFFFF",
    ink: "#162B23",
    muted: "#577066",
    accent: "#1F8A65",
    accentSoft: "#E0F4EC",
    border: "#D4E5DC",
    quoteBg: "#EEF6F1",
  },
  ink: {
    bg: "#F4F5F7",
    bgAccent: "#E5E7EB",
    surface: "#FFFFFF",
    ink: "#111827",
    muted: "#6B7280",
    accent: "#2563EB",
    accentSoft: "#DBEAFE",
    border: "#E2E8F0",
    quoteBg: "#F1F5F9",
  },
  night: {
    bg: "#11151D",
    bgAccent: "#1B2230",
    surface: "#181E29",
    ink: "#F3F4F6",
    muted: "#9CA3AF",
    accent: "#F59E0B",
    accentSoft: "#2D2516",
    border: "#2A3242",
    quoteBg: "#202736",
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeCardCss(raw: string): string {
  return raw
    .replace(/<\/style/gi, "/* blocked */")
    .replace(/@(?:import|charset|namespace)\b[^;]*(?:;|$)/gi, "")
    .replace(/@font-face\s*\{[\s\S]*?\}/gi, "")
    .replace(/url\s*\([\s\S]*?\)/gi, "none")
    .replace(/expression\s*\([\s\S]*?\)/gi, "none")
    .replace(/(?:-moz-binding|behavior)\s*:[^;]*(?:;|$)/gi, "");
}

const blockedTagNames = "script|iframe|object|embed|applet|form|input|textarea|select|button|meta|link|base|frame|frameset|foreignObject|use|audio|video|source";

export function sanitizeCardHtml(raw: string): string {
  let out = raw;
  out = out.replace(
    new RegExp(`<(${blockedTagNames})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"),
    "",
  );
  out = out.replace(
    new RegExp(`<\\/?(${blockedTagNames})\\b[^>]*\\/?>`, "gi"),
    "",
  );
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, css: string) => `<style>${sanitizeCardCss(css)}</style>`);
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, _q, d?: string, s?: string) => {
    const clean = sanitizeCardCss(d ?? s ?? "").replace(/"/g, "'");
    return ` style="${clean}"`;
  });
  out = out.replace(/\s(href|src|xlink:href|poster|srcset)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_m, attr: string, _full: string, d?: string, s?: string, u?: string) => {
      const value = (d ?? s ?? u ?? "").trim();
      if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value)) {
        return ` ${attr}="${escapeHtml(value)}"`;
      }
      return "";
    });
  return out;
}

function themeVariables(theme: CardTheme): string {
  const p = palettes[theme];
  return `:root {
    --bg: ${p.bg};
    --bg-accent: ${p.bgAccent};
    --surface: ${p.surface};
    --ink: ${p.ink};
    --muted: ${p.muted};
    --accent: ${p.accent};
    --accent-soft: ${p.accentSoft};
    --border: ${p.border};
    --quote-bg: ${p.quoteBg};
  }`;
}

const baseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${cardWidth}px;
    height: ${cardHeight}px;
    overflow: hidden;
    background: var(--bg);
    color: var(--ink);
    font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Noto Sans CJK SC", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .canvas {
    position: relative;
    width: ${cardWidth}px;
    height: ${cardHeight}px;
    padding: 58px;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 88% 8%, var(--bg-accent) 0%, transparent 45%), var(--bg);
  }
  .sheet {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 36px;
    padding: 64px 60px 52px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.06);
    position: relative;
    overflow: hidden;
  }
  .sheet::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 10px;
    background: var(--accent);
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 42px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 12px 24px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .ipa {
    font-family: "Segoe UI", "Lucida Sans Unicode", "Arial Unicode MS", "DejaVu Sans", "Noto Sans", sans-serif;
  }
  .footer {
    margin-top: auto;
    padding-top: 28px;
    border-top: 2px dashed var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--muted);
    font-size: 24px;
    letter-spacing: 0.03em;
  }
  .footer-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    display: inline-block;
    margin-right: 12px;
  }

  /* vocab */
  .vocab-head {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;
  }
  .vocab-word {
    font-size: 86px;
    line-height: 1.08;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--ink);
    word-break: break-word;
  }
  .vocab-word.long { font-size: 68px; }
  .vocab-word.very-long { font-size: 56px; }
  .vocab-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }
  .vocab-phonetic {
    font-size: 36px;
    color: var(--muted);
    font-weight: 500;
  }
  .vocab-pos {
    padding: 6px 18px;
    border-radius: 12px;
    border: 2px solid var(--border);
    color: var(--accent);
    font-size: 28px;
    font-weight: 700;
  }
  .vocab-meaning-box {
    background: var(--quote-bg);
    border-left: 8px solid var(--accent);
    border-radius: 20px;
    padding: 36px 38px;
    margin-bottom: 34px;
  }
  .vocab-label {
    font-size: 22px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .vocab-meaning {
    font-size: 46px;
    line-height: 1.38;
    font-weight: 700;
    color: var(--ink);
  }
  .vocab-section {
    padding: 28px 34px;
    border: 2px solid var(--border);
    border-radius: 22px;
    margin-bottom: 24px;
  }
  .vocab-example {
    font-size: 32px;
    line-height: 1.48;
    color: var(--ink);
    font-weight: 500;
  }
  .vocab-example-zh {
    font-size: 28px;
    line-height: 1.45;
    color: var(--muted);
    margin-top: 12px;
  }
  .vocab-tip {
    font-size: 29px;
    line-height: 1.48;
    color: var(--ink);
  }

  /* list */
  .list-title {
    font-size: 62px;
    line-height: 1.22;
    font-weight: 800;
    margin-bottom: 16px;
  }
  .list-sub {
    font-size: 30px;
    line-height: 1.45;
    color: var(--muted);
    margin-bottom: 36px;
  }
  .list-items {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 24px;
  }
  .list-row {
    display: flex;
    align-items: flex-start;
    gap: 22px;
    padding: 24px 28px;
    border-radius: 22px;
    background: var(--quote-bg);
    border: 1.5px solid var(--border);
  }
  .list-num {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--accent);
    color: #FFFFFF;
    font-size: 26px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
  }
  .list-content { flex: 1; min-width: 0; }
  .list-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .list-label {
    font-size: 34px;
    font-weight: 700;
    line-height: 1.32;
  }
  .list-tag {
    flex-shrink: 0;
    font-size: 22px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .list-detail {
    font-size: 26px;
    line-height: 1.42;
    color: var(--muted);
    margin-top: 8px;
  }

  /* compare */
  .compare-title {
    font-size: 56px;
    line-height: 1.24;
    font-weight: 800;
    margin-bottom: 34px;
  }
  .compare-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    flex: 1;
    margin-bottom: 28px;
  }
  .compare-col {
    border-radius: 24px;
    padding: 32px 28px;
    border: 2px solid var(--border);
    background: var(--quote-bg);
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .compare-col.right {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .compare-col-title {
    font-size: 34px;
    font-weight: 800;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }
  .compare-col.right .compare-col-title { color: var(--accent); }
  .compare-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .compare-list li {
    font-size: 28px;
    line-height: 1.45;
    padding-left: 26px;
    position: relative;
  }
  .compare-list li::before {
    content: "•";
    position: absolute;
    left: 0;
    color: var(--accent);
    font-weight: 800;
  }
  .compare-conclusion {
    padding: 24px 30px;
    border-radius: 20px;
    border: 2px solid var(--border);
    font-size: 28px;
    line-height: 1.45;
    font-weight: 600;
    margin-bottom: 24px;
  }

  /* quote */
  .quote-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 20px 8px;
  }
  .quote-mark {
    font-size: 128px;
    line-height: 0.7;
    color: var(--accent);
    font-weight: 800;
    margin-bottom: 24px;
  }
  .quote-text {
    font-size: 56px;
    line-height: 1.38;
    font-weight: 800;
    letter-spacing: -0.01em;
    margin-bottom: 36px;
  }
  .quote-author {
    font-size: 30px;
    color: var(--accent);
    font-weight: 700;
    margin-bottom: 24px;
  }
  .quote-note {
    padding: 26px 30px;
    border-radius: 20px;
    background: var(--quote-bg);
    font-size: 28px;
    line-height: 1.5;
    color: var(--muted);
  }
`;

function renderFooter(footer?: string): string {
  const text = escapeHtml(footer ?? "摘星 · 知识卡片");
  return `<div class="footer"><span><i class="footer-dot"></i>${text}</span><span>3:4</span></div>`;
}

function renderTopbar(badge?: string): string {
  if (!badge) return "";
  return `<div class="topbar"><span class="badge">${escapeHtml(badge)}</span></div>`;
}

function renderVocabBody(spec: z.infer<typeof vocabSpecSchema>): string {
  const len = spec.word.length;
  const wordClass = len > 18 ? "vocab-word very-long" : len > 11 ? "vocab-word long" : "vocab-word";
  return `<div class="canvas"><div class="sheet">
    ${renderTopbar(spec.badge ?? "高频词汇卡片")}
    <div class="vocab-head">
      <div class="${wordClass}">${escapeHtml(spec.word)}</div>
      ${(spec.phonetic || spec.pos) ? `<div class="vocab-meta">
        ${spec.pos ? `<span class="vocab-pos">${escapeHtml(spec.pos)}</span>` : ""}
        ${spec.phonetic ? `<span class="vocab-phonetic ipa">${escapeHtml(spec.phonetic)}</span>` : ""}
      </div>` : ""}
    </div>
    <div class="vocab-meaning-box">
      <div class="vocab-label">核心释义</div>
      <div class="vocab-meaning">${escapeHtml(spec.meaning)}</div>
    </div>
    ${spec.example ? `<div class="vocab-section">
      <div class="vocab-label">例句示范</div>
      <div class="vocab-example">${escapeHtml(spec.example)}</div>
      ${spec.exampleZh ? `<div class="vocab-example-zh">${escapeHtml(spec.exampleZh)}</div>` : ""}
    </div>` : ""}
    ${spec.tip ? `<div class="vocab-section">
      <div class="vocab-label">记忆 / 考点</div>
      <div class="vocab-tip">${escapeHtml(spec.tip)}</div>
    </div>` : ""}
    ${renderFooter(spec.footer)}
  </div></div>`;
}

function renderListBody(spec: z.infer<typeof listSpecSchema>): string {
  const rows = spec.items.map((item, idx) => `<div class="list-row">
    <div class="list-num">${idx + 1}</div>
    <div class="list-content">
      <div class="list-row-head">
        <div class="list-label ipa">${escapeHtml(item.label)}</div>
        ${item.tag ? `<span class="list-tag">${escapeHtml(item.tag)}</span>` : ""}
      </div>
      ${item.detail ? `<div class="list-detail">${escapeHtml(item.detail)}</div>` : ""}
    </div>
  </div>`).join("");
  return `<div class="canvas"><div class="sheet">
    ${renderTopbar(spec.badge ?? "重点清单")}
    <h1 class="list-title">${escapeHtml(spec.title)}</h1>
    ${spec.subtitle ? `<p class="list-sub">${escapeHtml(spec.subtitle)}</p>` : ""}
    <div class="list-items">${rows}</div>
    ${renderFooter(spec.footer)}
  </div></div>`;
}

function renderCompareBody(spec: z.infer<typeof compareSpecSchema>): string {
  const leftItems = spec.left.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const rightItems = spec.right.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<div class="canvas"><div class="sheet">
    ${renderTopbar(spec.badge ?? "对比速览")}
    <h1 class="compare-title">${escapeHtml(spec.title)}</h1>
    <div class="compare-grid">
      <div class="compare-col">
        <div class="compare-col-title">${escapeHtml(spec.left.label)}</div>
        <ul class="compare-list">${leftItems}</ul>
      </div>
      <div class="compare-col right">
        <div class="compare-col-title">${escapeHtml(spec.right.label)}</div>
        <ul class="compare-list">${rightItems}</ul>
      </div>
    </div>
    ${spec.conclusion ? `<div class="compare-conclusion">${escapeHtml(spec.conclusion)}</div>` : ""}
    ${renderFooter(spec.footer)}
  </div></div>`;
}

function renderQuoteBody(spec: z.infer<typeof quoteSpecSchema>): string {
  return `<div class="canvas"><div class="sheet">
    ${renderTopbar(spec.badge)}
    <div class="quote-wrap">
      <div class="quote-mark">“</div>
      <div class="quote-text">${escapeHtml(spec.quote)}</div>
      ${spec.author ? `<div class="quote-author">—— ${escapeHtml(spec.author)}</div>` : ""}
      ${spec.note ? `<div class="quote-note">${escapeHtml(spec.note)}</div>` : ""}
    </div>
    ${renderFooter(spec.footer)}
  </div></div>`;
}

export function buildCardHtml(spec: CardSpec): string {
  let body = "";
  let customCss = "";
  if (spec.template === "vocab") body = renderVocabBody(spec);
  else if (spec.template === "list") body = renderListBody(spec);
  else if (spec.template === "compare") body = renderCompareBody(spec);
  else if (spec.template === "quote") body = renderQuoteBody(spec);
  else {
    body = `<div class="canvas">${sanitizeCardHtml(spec.html)}</div>`;
    customCss = spec.css ? sanitizeCardCss(spec.css) : "";
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
  <style>${themeVariables(spec.theme)}${baseStyles}${customCss}</style>
</head>
<body>${body}</body>
</html>`;
}

const candidateExecutables = (): string[] => {
  const envPath = process.env.CHROME_PATH?.trim();
  const candidates: string[] = envPath ? [envPath] : [];
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }
  return candidates;
};

let cachedBrowser: string | undefined;

export async function findBrowserExecutable(): Promise<string> {
  if (cachedBrowser) {
    try {
      await access(cachedBrowser, fsConstants.F_OK);
      return cachedBrowser;
    } catch {
      cachedBrowser = undefined;
    }
  }
  for (const candidate of candidateExecutables()) {
    try {
      await access(candidate, fsConstants.F_OK);
      cachedBrowser = candidate;
      return candidate;
    } catch {
      // Try next browser candidate.
    }
  }
  throw new Error("未找到本机 Chrome / Edge 浏览器，无法渲染文字卡片（可配置 CHROME_PATH 环境变量）。");
}

export async function renderCardToPng(spec: CardSpec): Promise<Buffer> {
  const executable = await findBrowserExecutable();
  const dir = await mkdtemp(join(tmpdir(), "star-card-"));
  const htmlPath = join(dir, "card.html");
  const pngPath = join(dir, "card.png");
  const profileDir = join(dir, "profile");
  try {
    await writeFile(htmlPath, buildCardHtml(spec), "utf8");
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--host-resolver-rules=MAP * ~NOTFOUND",
      `--user-data-dir=${profileDir}`,
      `--window-size=${cardWidth},${cardHeight}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ];
    if (process.platform === "linux" && process.getuid?.() === 0) {
      args.unshift("--no-sandbox");
    }
    await execFileAsync(executable, args, { timeout: 20_000, windowsHide: true });
    const bytes = await readFile(pngPath);
    if (imageType(bytes) !== "image/png") {
      throw new Error("卡片渲染输出不是有效的 PNG 图片");
    }
    return bytes;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function renderCardsToPng(specs: CardSpec[], concurrency = 3): Promise<Buffer[]> {
  if (!specs.length || specs.length > 9) {
    throw new Error("单次卡片渲染数量必须在 1 到 9 张之间");
  }
  const results = new Array<Buffer>(specs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, specs.length) }, async () => {
    while (cursor < specs.length) {
      const index = cursor++;
      results[index] = await renderCardToPng(specs[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
