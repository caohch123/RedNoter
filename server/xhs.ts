import { createHmac, timingSafeEqual } from "node:crypto";
import dns from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { env } from "./config.js";

const LINK_RE = /https?:\/\/[^\s<>"，。；！？”）]+/gu;
const BARE_LINK_RE = /(?:^|[\s，。；！？”（）(【\[<>"'])((?:www\.xiaohongshu\.com|xiaohongshu\.com|xhslink\.com|xhslink\.cn)\/[^\s<>"，。；！？”）]+)/giu;
const NOTE_PATH_RE = /\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([a-zA-Z0-9]+)/;
const PAGE_HOSTS = new Set(["www.xiaohongshu.com", "xiaohongshu.com", "xhslink.com", "xhslink.cn"]);
const MEDIA_SUFFIXES = ["xhscdn.com", "xiaohongshu.com", "xiaohongshu.net"];

export class XhsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ReferenceImage = {
  url: string;
  sig: string;
  role: "media" | "cover";
};

export type ReferenceMeta = {
  platform: "xiaohongshu";
  noteId: string;
  url: string;
  noteType: "image" | "video";
  author: string;
  publishedAt: string;
  likes: number | null;
  favorites: number | null;
  comments: number | null;
  shares: number | null;
  images: ReferenceImage[];
};

export type ParsedXhsNote = {
  noteId: string;
  url: string;
  title: string;
  body: string;
  tags: string[];
  noteType: "image" | "video";
  author: string;
  authorId: string;
  publishedAt: string;
  likes: number | null;
  favorites: number | null;
  comments: number | null;
  shares: number | null;
  images: ReferenceImage[];
  videoUrl: string | null;
  referenceText: string;
  referenceTitle: string;
  referenceTags: string[];
  meta: ReferenceMeta;
};

const COLLECTION_ERROR_MESSAGES: Record<string, string> = {
  network_unreachable: "小红书采集进程无法连接目标服务器（网络连接失败），请检查当前网络环境后重试。",
  tls_error: "连接小红书时证书校验失败，请检查本机时间、代理或证书配置。",
  login_required: "这篇笔记受到小红书登录限制，当前无法直接解析。请确认笔记可公开访问，或改用手动粘贴内容。",
  access_restricted: "小红书拒绝了此次访问（HTTP 403）。请在浏览器检查笔记是否可打开，复制最新分享链接后再试。",
  note_unavailable: "笔记不存在或已不可访问（HTTP 404/410），请检查并重新复制分享链接。",
  rate_limited: "小红书限制了请求频率，请稍后重试。",
  missing_share_token: "小红书拦截了无分享参数的裸链接（缺少 xsec_token）。请在小红书笔记页点击「分享 → 复制链接」，或粘贴带 xsec_token 的完整网址 / 小红书 App 分享文案后重试。",
  page_unrecognized: "已访问小红书页面，但未取得可解析的笔记内容。可能是登录限制或页面结构变化，请在浏览器确认笔记可打开后使用最新分享链接重试。",
  parse_failed: "笔记页面解析失败，可能是页面结构变化，请使用最新分享链接重试。",
  unsafe_redirect: "采集地址或重定向目标未通过安全检查。请使用小红书官方分享链接。",
  too_many_redirects: "小红书页面重定向次数过多，请使用最新分享链接重试。",
  upstream_error: "小红书页面暂时返回异常，请稍后重试。",
};

export function mapCollectionError(code: string): XhsError {
  const message = COLLECTION_ERROR_MESSAGES[code] ?? "小红书采集服务返回未知错误，请检查服务版本后重试。";
  const status = code === "unsafe_redirect" ? 400
    : code === "rate_limited" ? 429
      : code === "network_unreachable" || code === "upstream_error" ? 502
        : 422;
  return new XhsError(status, code.toUpperCase(), message);
}

function isPublicIPv4Octets(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT & 阿里云内网 100.100/16
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

function parseIPv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

function expandIPv6(ip: string): number[] | null {
  const zoneIdx = ip.indexOf("%");
  const clean = zoneIdx === -1 ? ip : ip.slice(0, zoneIdx);
  const halves = clean.split("::");
  if (halves.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const tokens = side.split(":");
    const out: number[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.includes(".")) {
        if (i !== tokens.length - 1) return null;
        const v4 = parseIPv4(token);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(token)) return null;
        out.push(Number.parseInt(token, 16));
      }
    }
    return out;
  };

  const left = parseSide(halves[0]);
  if (!left) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const right = parseSide(halves[1]);
  if (!right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

/** 校验 IP 是否为公网可路由单播地址，拦截回环、内网、链路本地与 CGNAT。 */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const v4 = parseIPv4(ip);
    if (!v4) return false;
    const [a, b, c] = v4;
    if (!isPublicIPv4Octets(a, b)) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const hextets = expandIPv6(ip);
    if (!hextets) return false;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    if (hextets[0] === 0 && hextets[1] === 0 && hextets[2] === 0 && hextets[3] === 0 &&
      hextets[4] === 0 && hextets[5] === 0xffff) {
      const a = hextets[6] >> 8;
      const b = hextets[6] & 0xff;
      const c = hextets[7] >> 8;
      const d = hextets[7] & 0xff;
      return isPublicIp(`${a}.${b}.${c}.${d}`);
    }
    // 仅放行公网单播段 2000::/3，并排除文档地址 2001:db8::/32
    if (hextets[0] < 0x2000 || hextets[0] > 0x3fff) return false;
    if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return false;
    return true;
  }
  return false;
}

export function isAllowedXhsPageHost(host: string): boolean {
  return PAGE_HOSTS.has(host.toLowerCase());
}

export function isAllowedXhsMediaHost(host: string): boolean {
  const lower = host.toLowerCase();
  return MEDIA_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

function parseValidatedUrl(raw: string, hostCheck: (host: string) => boolean, code = "UNSAFE_REDIRECT"): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new XhsError(400, code, "链接地址格式无效。");
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
    throw new XhsError(400, code, "链接协议或地址不符合安全要求。");
  }
  if (parsed.port !== "") {
    throw new XhsError(400, code, "链接包含不允许的端口。");
  }
  if (!hostCheck(parsed.hostname)) {
    throw new XhsError(400, code, "目标域名不在允许的小红书域名白名单内。");
  }
  return parsed;
}

function tryAcceptXhsCandidate(candidate: string): string | null {
  const cleaned = candidate.replace(/[.,;!?)\]}]+$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password || parsed.port !== "") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!isAllowedXhsPageHost(host)) return null;
  if (host.includes("xiaohongshu")) {
    if (!NOTE_PATH_RE.test(parsed.pathname)) return null;
  } else if (parsed.pathname.length <= 1) {
    return null;
  }
  return parsed.toString();
}

/** 从完整分享文案或 URL 中提取第一条有效小红书链接（兼容无 https:// 前缀的裸域名链接）。 */
export function extractXhsLink(text: string): string {
  const matches = text.match(LINK_RE) ?? [];
  for (const match of matches) {
    const accepted = tryAcceptXhsCandidate(match);
    if (accepted) return accepted;
  }
  if (!matches.length) {
    for (const match of text.matchAll(BARE_LINK_RE)) {
      const bare = match[1];
      if (!bare) continue;
      const accepted = tryAcceptXhsCandidate(`https://${bare}`);
      if (accepted) return accepted;
    }
  }
  throw new XhsError(400, "INVALID_XHS_LINK", "未识别到有效的小红书笔记链接，请粘贴完整分享文案或小红书链接");
}

async function resolvePublicIp(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new XhsError(502, "NETWORK_UNREACHABLE", "无法解析目标域名，请检查网络连接后重试。");
  }
  if (!records.length) {
    throw new XhsError(502, "NETWORK_UNREACHABLE", "目标域名未返回有效 IP 地址。");
  }
  for (const record of records) {
    if (!isPublicIp(record.address)) {
      throw new XhsError(400, "UNSAFE_REDIRECT", "采集目标解析到了受限网络地址，已拒绝访问。");
    }
  }
  const sorted = [...records].sort((a, b) => a.family - b.family);
  const chosen = sorted[0];
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

type PinnedResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  finalUrl: string;
};

async function requestOncePinned(
  parsed: URL,
  headers: Record<string, string>,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const hostname = parsed.hostname;
  const pinned = await resolvePublicIp(hostname);
  const isHttps = parsed.protocol === "https:";
  const transport = isHttps ? https : http;

  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      rejectPromise(err);
    };
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname,
        port: isHttps ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers,
        timeout: timeoutMs,
        ...(isHttps ? { servername: hostname } : {}),
        lookup: (reqHost, options, callback) => {
          const cb = typeof options === "function" ? options : callback;
          const opts = typeof options === "function" ? undefined : options;
          if (reqHost.toLowerCase() !== hostname.toLowerCase()) {
            cb(new Error("Host mismatch"), "", 4);
            return;
          }
          if (opts && typeof opts === "object" && opts.all) {
            (cb as (err: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void)(
              null,
              [{ address: pinned.address, family: pinned.family }],
            );
            return;
          }
          (cb as (err: NodeJS.ErrnoException | null, address: string, family: number) => void)(
            null,
            pinned.address,
            pinned.family,
          );
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy();
            fail(new XhsError(413, "MEDIA_TOO_LARGE", "返回内容超出大小限制。"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", (err) => fail(err));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      fail(new XhsError(504, "NETWORK_TIMEOUT", "请求小红书资源超时，请稍后重试。"));
    });
    req.on("error", (err) => {
      if (err instanceof XhsError) fail(err);
      else fail(new XhsError(502, "NETWORK_UNREACHABLE", "连接小红书资源失败，请稍后重试。"));
    });
    req.end();
  });
}

async function pinnedRequest(
  startUrl: string,
  options: {
    hostCheck: (host: string) => boolean;
    headers: Record<string, string>;
    timeoutMs: number;
    maxBytes: number;
    maxRedirects?: number;
    stopOnRedirect?: (location: URL) => boolean;
  },
): Promise<PinnedResponse> {
  const maxRedirects = options.maxRedirects ?? 6;
  let current = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = parseValidatedUrl(current, options.hostCheck);
    const res = await requestOncePinned(parsed, options.headers, options.timeoutMs, options.maxBytes);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      const nextUrl = new URL(res.headers.location, parsed);
      parseValidatedUrl(nextUrl.toString(), options.hostCheck);
      if (options.stopOnRedirect?.(nextUrl)) {
        return { ...res, finalUrl: nextUrl.toString() };
      }
      current = nextUrl.toString();
      continue;
    }
    return { ...res, finalUrl: parsed.toString() };
  }
  throw mapCollectionError("too_many_redirects");
}

/** 将 xhslink.com/xhslink.cn 短链解析为真实的小红书笔记详情链接。 */
export async function resolveXhsShortUrl(rawUrl: string): Promise<string> {
  const parsed = parseValidatedUrl(rawUrl, isAllowedXhsPageHost, "INVALID_XHS_LINK");
  if (!parsed.hostname.toLowerCase().startsWith("xhslink.")) {
    if (!NOTE_PATH_RE.test(parsed.pathname)) {
      throw new XhsError(400, "INVALID_XHS_LINK", "请粘贴指向具体小红书笔记的链接。");
    }
    return parsed.toString();
  }

  const response = await pinnedRequest(parsed.toString(), {
    hostCheck: isAllowedXhsPageHost,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml" },
    timeoutMs: 15_000,
    maxBytes: 1024 * 1024,
    maxRedirects: 6,
    stopOnRedirect: (next) =>
      next.hostname.toLowerCase().includes("xiaohongshu") && NOTE_PATH_RE.test(next.pathname),
  });

  const finalParsed = parseValidatedUrl(response.finalUrl, isAllowedXhsPageHost, "INVALID_SHORT_LINK");
  if (!finalParsed.hostname.toLowerCase().includes("xiaohongshu") || !NOTE_PATH_RE.test(finalParsed.pathname)) {
    throw new XhsError(400, "INVALID_SHORT_LINK", "短链接未指向有效的小红书笔记，请换用最新分享链接。");
  }
  if (finalParsed.pathname.startsWith("/login") || finalParsed.pathname.startsWith("/signin")) {
    throw mapCollectionError("login_required");
  }
  return finalParsed.toString();
}

export function readCollectorToken(): string {
  const fromEnv = (process.env.XHS_COLLECTOR_TOKEN ?? env.xhsCollectorToken).trim();
  if (fromEnv) return fromEnv;
  const tokenPath = resolve(".creation-collector", "collector.token");
  if (!existsSync(tokenPath)) return "";
  try {
    return readFileSync(tokenPath, "utf8").trim();
  } catch {
    return "";
  }
}

function mediaSigningKey(): string {
  return readCollectorToken() || (process.env.CREATION_MODEL_CONFIG_KEY ?? "").trim();
}

export function signMediaUrl(url: string): string {
  const secret = mediaSigningKey();
  if (!secret) throw new XhsError(503, "XHS_COLLECTOR_UNAVAILABLE", "小红书采集令牌未就绪，无法签发图片预览签名。");
  return createHmac("sha256", secret).update(`xhs-media-v1:${url}`).digest("hex");
}

export function verifyMediaSignature(url: string, sig: string): boolean {
  const secret = mediaSigningKey();
  if (!secret || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`xhs-media-v1:${url}`).digest("hex"), "utf8");
  const provided = Buffer.from(sig.toLowerCase(), "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function parseCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  let text = String(value).trim().replace(/,/g, "");
  if (!text) return null;
  let multiplier = 1;
  if (text.endsWith("万")) {
    multiplier = 10_000;
    text = text.slice(0, -1);
  } else if (text.toLowerCase().endsWith("w")) {
    multiplier = 10_000;
    text = text.slice(0, -1);
  }
  const num = Number.parseFloat(text);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * multiplier);
}

function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }
  if (typeof value === "string") {
    return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTags(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of asTextList(value)) {
    const clean = raw.replace(/^[#＃]+|[#＃]+$/g, "").trim();
    if (!clean || clean.length > 30 || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 10) break;
  }
  return out;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSafeMediaUrl(raw: string): string | null {
  try {
    const parsed = parseValidatedUrl(raw, isAllowedXhsMediaHost);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function formatReferenceText(title: string, body: string): string {
  const combined = [title.trim(), body.trim()].filter(Boolean).join("\n\n");
  return Array.from(combined).slice(0, 8000).join("");
}

function collectorBaseUrl(): string {
  return (process.env.XHS_COLLECTOR_URL ?? env.xhsCollectorUrl).replace(/\/$/, "");
}

export async function checkCollectorHealth(): Promise<boolean> {
  const token = readCollectorToken();
  if (!token) return false;
  try {
    const res = await fetch(`${collectorBaseUrl()}/health`, {
      headers: { "x-collector-token": token },
      signal: AbortSignal.timeout(1000),
      redirect: "error",
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null) as { status?: string } | null;
    return json?.status === "ok";
  } catch {
    return false;
  }
}

async function callCollectorDetail(
  resolvedUrl: string,
  token: string,
): Promise<{ data: Record<string, unknown>; errorCode?: string }> {
  let response: Response;
  try {
    response = await fetch(`${collectorBaseUrl()}/xhs/detail`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-collector-token": token },
      body: JSON.stringify({ url: resolvedUrl, download: false, check_record: false, cookie: "" }),
      signal: AbortSignal.timeout(45_000),
      redirect: "error",
    });
  } catch {
    throw new XhsError(503, "XHS_COLLECTOR_UNAVAILABLE", "小红书采集服务不可用或响应超时，请确认采集服务已运行。");
  }

  if (response.status === 400) {
    throw new XhsError(400, "INVALID_XHS_LINK", "仅支持解析有效的小红书笔记链接。");
  }
  if (response.status === 403) {
    throw new XhsError(503, "XHS_COLLECTOR_AUTH_FAILED", "小红书采集服务内部鉴权失败，请检查配置后重试。");
  }
  if (!response.ok) {
    throw new XhsError(502, "XHS_COLLECTOR_ERROR", `小红书采集服务返回异常（HTTP ${response.status}）。`);
  }

  const envelope = await response.json().catch(() => null) as {
    data?: Record<string, unknown>;
    error_code?: string;
  } | null;
  if (!envelope) {
    throw new XhsError(502, "PARSE_FAILED", "小红书采集响应格式异常，请稍后重试。");
  }
  if (envelope.error_code) {
    return { data: envelope.data ?? {}, errorCode: envelope.error_code };
  }

  const data = envelope.data ?? {};
  if (!asString(data["作品ID"])) {
    return { data, errorCode: "page_unrecognized" };
  }
  return { data };
}

export async function parseXhsNote(rawText: string): Promise<ParsedXhsNote> {
  const extracted = extractXhsLink(rawText);
  const resolvedUrl = await resolveXhsShortUrl(extracted);
  const token = readCollectorToken();
  if (!token) {
    throw new XhsError(503, "XHS_COLLECTOR_UNAVAILABLE", "小红书采集服务尚未启动，请先运行 npm run dev 或 npm run dev:collector");
  }

  let detail = await callCollectorDetail(resolvedUrl, token);
  if (detail.errorCode) {
    const parsedResolved = new URL(resolvedUrl);
    const hasShareToken = parsedResolved.searchParams.has("xsec_token");
    const noteIdMatch = parsedResolved.pathname.match(NOTE_PATH_RE);
    const fallbackCodes = new Set(["missing_share_token", "page_unrecognized", "note_unavailable"]);
    if (
      !hasShareToken &&
      noteIdMatch?.[1] &&
      !parsedResolved.pathname.startsWith("/discovery/item/") &&
      fallbackCodes.has(detail.errorCode)
    ) {
      const fallbackUrl = `https://www.xiaohongshu.com/discovery/item/${noteIdMatch[1]}`;
      const fallbackDetail = await callCollectorDetail(fallbackUrl, token);
      if (!fallbackDetail.errorCode) {
        detail = fallbackDetail;
      } else {
        const mappedCode = (fallbackDetail.errorCode === "page_unrecognized" || fallbackDetail.errorCode === "note_unavailable")
          ? "missing_share_token"
          : fallbackDetail.errorCode;
        throw mapCollectionError(mappedCode);
      }
    } else {
      throw mapCollectionError(detail.errorCode);
    }
  }

  const data = detail.data;
  const noteId = asString(data["作品ID"]);

  const title = asString(data["作品标题"]);
  const body = asString(data["作品描述"]);
  const tags = normalizeTags(data["作品标签"]);
  const noteType: "image" | "video" = asString(data["作品类型"]).includes("视频") ? "video" : "image";
  const author = asString(data["作者昵称"]);
  const authorId = asString(data["作者ID"]);
  const publishedAt = asString(data["发布时间"]);
  const likes = parseCount(data["点赞数量"]);
  const favorites = parseCount(data["收藏数量"]);
  const comments = parseCount(data["评论数量"]);
  const shares = parseCount(data["分享数量"]);

  const downloads = asTextList(data["下载地址"]).map(isSafeMediaUrl).filter((url): url is string => Boolean(url));
  const coverUrl = isSafeMediaUrl(asString(data["封面地址"]));
  const images: ReferenceImage[] = [];
  if (noteType === "video") {
    if (coverUrl) images.push({ url: coverUrl, sig: signMediaUrl(coverUrl), role: "cover" });
  } else {
    for (const url of downloads.slice(0, 20)) {
      images.push({ url, sig: signMediaUrl(url), role: "media" });
    }
  }
  const videoUrl = noteType === "video" ? (downloads[0] ?? null) : null;
  const canonicalUrl = `https://www.xiaohongshu.com/explore/${encodeURIComponent(noteId)}`;
  const referenceText = formatReferenceText(title, body);
  const referenceTitle = Array.from(title || body.split("\n")[0] || "小红书参考笔记").slice(0, 200).join("");
  const meta: ReferenceMeta = {
    platform: "xiaohongshu",
    noteId,
    url: canonicalUrl,
    noteType,
    author: Array.from(author).slice(0, 100).join(""),
    publishedAt: Array.from(publishedAt).slice(0, 64).join(""),
    likes,
    favorites,
    comments,
    shares,
    images,
  };

  return {
    noteId,
    url: canonicalUrl,
    title,
    body,
    tags,
    noteType,
    author,
    authorId,
    publishedAt,
    likes,
    favorites,
    comments,
    shares,
    images,
    videoUrl,
    referenceText,
    referenceTitle,
    referenceTags: tags,
    meta,
  };
}

function detectImageMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const header6 = bytes.subarray(0, 6).toString("ascii");
  if (header6 === "GIF87a" || header6 === "GIF89a") return "image/gif";
  return null;
}

export async function fetchXhsMediaImage(
  url: string,
  sig: string,
  maxBytes = 5 * 1024 * 1024,
): Promise<{ bytes: Buffer; mime: string }> {
  if (!verifyMediaSignature(url, sig)) {
    throw new XhsError(403, "INVALID_MEDIA_SIGNATURE", "参考图片预览签名无效或已失效，请重新解析链接。");
  }
  const parsed = parseValidatedUrl(url, isAllowedXhsMediaHost, "INVALID_MEDIA_URL");
  const response = await pinnedRequest(parsed.toString(), {
    hostCheck: isAllowedXhsMediaHost,
    headers: {
      Referer: "https://www.xiaohongshu.com/",
      "User-Agent": "Mozilla/5.0",
    },
    timeoutMs: 30_000,
    maxBytes,
    maxRedirects: 5,
  });

  if (response.status === 401 || response.status === 403) {
    throw new XhsError(502, "MEDIA_FORBIDDEN", `原图访问被拒绝（HTTP ${response.status}），图片链接可能已过期，请重新解析链接。`);
  }
  if (response.status === 404 || response.status === 410) {
    throw new XhsError(502, "MEDIA_NOT_FOUND", "原图已失效或不可访问，请重新解析链接。");
  }
  if (response.status === 429) {
    throw new XhsError(429, "MEDIA_RATE_LIMITED", "原图获取请求过于频繁，请稍后重试。");
  }
  if (response.status !== 200) {
    throw new XhsError(502, "MEDIA_UPSTREAM_ERROR", `无法获取参考原图（HTTP ${response.status}）。`);
  }

  const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const allowedHeader = contentType === "" || contentType === "application/octet-stream" ||
    contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp" || contentType === "image/gif";
  const detectedMime = detectImageMime(response.body);
  if (!allowedHeader || !detectedMime) {
    throw new XhsError(502, "INVALID_MEDIA_TYPE", "远程响应不是可支持的 JPG/PNG/WebP/GIF 图片。");
  }
  return { bytes: response.body, mime: detectedMime };
}
