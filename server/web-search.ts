import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";

export type WebSearchItem = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
};

type WebSearchProvider = "bocha" | "tavily" | "bing-rss" | "bing-global-rss" | "duckduckgo";

export type WebSearchResult = {
  query: string;
  status: "ok" | "empty" | "unavailable";
  provider: WebSearchProvider | null;
  results: WebSearchItem[];
};

export const webSourceSchema = z.object({
  id: z.string().regex(/^web_[a-f0-9]{24}$/),
  url: z.url({ protocol: /^https?$/ }).max(4000),
  title: z.string().max(200),
  retrievedAt: z.iso.datetime(),
});

export type WebSource = z.infer<typeof webSourceSchema>;

export type WebPageResult = WebSource & {
  description: string;
  content: string;
  truncated: boolean;
  contentType: string;
};

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 1_500_000;

export function isPrivateIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIp(normalized.slice(7));
  }
  const family = isIP(normalized);
  if (family === 4) {
    const parts = normalized.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (family === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (/^f[cd]/i.test(normalized)) return true; // ULA fc00::/7
    if (/^fe[89ab]/i.test(normalized)) return true; // link-local fe80::/10
    if (/^ff/i.test(normalized)) return true; // multicast
    return false;
  }
  return true;
}

export async function assertPublicWebUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("无效的网页链接，请提供完整的 http:// 或 https:// 地址");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持访问 http 或 https 协议的公开网页");
  }
  if (url.username || url.password) {
    throw new Error("不允许访问带认证凭据的链接");
  }
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("禁止访问本地或内网地址");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("禁止访问私有或保留 IP 地址");
    return url;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error(`无法解析目标域名：${host}`);
  }
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("目标域名解析到内网或受限地址，已拦截访问");
  }
  return url;
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

function stripTags(html: string): string {
  const decoded = decodeHtmlEntities(html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapSearchRedirect(rawUrl: string): string {
  const cleaned = decodeHtmlEntities(rawUrl).trim();
  try {
    const parsed = new URL(cleaned, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    if (uddg && /^https?:\/\//i.test(uddg)) return uddg;
    if (parsed.hostname.endsWith("bing.com") && parsed.pathname.startsWith("/ck/")) {
      const u = parsed.searchParams.get("u");
      if (u && u.startsWith("a1")) {
        const decoded = Buffer.from(u.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }
    return parsed.toString();
  } catch {
    return cleaned;
  }
}

export function parseBingRss(xml: string, limit: number): WebSearchItem[] {
  const items: WebSearchItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = unwrapSearchRedirect(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const snippet = stripTags(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "");
    const pubDate = stripTags(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    if (!title || !/^https?:\/\//i.test(link)) continue;
    items.push({ title, url: link, snippet, ...(pubDate ? { publishedAt: pubDate } : {}) });
  }
  return items;
}

export function parseDuckDuckGoHtml(html: string, limit: number): WebSearchItem[] {
  const items: WebSearchItem[] = [];
  const blockRe = /<div[^>]*class="[^"]*result__body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null && items.length < limit) {
    const block = match[1];
    const linkMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = unwrapSearchRedirect(linkMatch[1]);
    const title = stripTags(linkMatch[2]);
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = stripTags(snippetMatch?.[1] ?? snippetMatch?.[2] ?? "");
    if (!title || !/^https?:\/\//i.test(url)) continue;
    items.push({ title, url, snippet });
  }
  return items;
}

async function searchBocha(query: string, limit: number, apiKey: string): Promise<WebSearchItem[]> {
  const res = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, count: limit, summary: true }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Bocha HTTP ${res.status}`);
  const data = await res.json() as {
    data?: { webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string; summary?: string; datePublished?: string }> } };
  };
  const pages = data?.data?.webPages?.value;
  if (!Array.isArray(pages)) throw new Error("Bocha 响应缺少搜索结果");
  return pages
    .slice(0, limit)
    .flatMap((item) => item.name && item.url ? [{
      title: item.name.trim(),
      url: item.url.trim(),
      snippet: (item.summary || item.snippet || "").trim(),
      ...(item.datePublished ? { publishedAt: item.datePublished } : {}),
    }] : []);
}

async function searchTavily(query: string, limit: number, apiKey: string): Promise<WebSearchItem[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: limit, search_depth: "basic" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
  if (!Array.isArray(data?.results)) throw new Error("Tavily 响应缺少搜索结果");
  return data.results
    .slice(0, limit)
    .flatMap((item) => item.title && item.url ? [{
      title: item.title.trim(),
      url: item.url.trim(),
      snippet: (item.content || "").trim(),
      ...(item.published_date ? { publishedAt: item.published_date } : {}),
    }] : []);
}

async function searchBingRss(query: string, limit: number, host: "cn.bing.com" | "www.bing.com"): Promise<WebSearchItem[]> {
  const url = `https://${host}/search?q=${encodeURIComponent(query)}&format=rss&count=${Math.min(10, Math.max(limit, 5))}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Bing RSS HTTP ${res.status}`);
  const xml = await res.text();
  if (!/<rss(?:\s|>)/i.test(xml)) throw new Error("Bing 返回的内容不是 RSS 搜索结果");
  return parseBingRss(xml, limit);
}

async function searchDuckDuckGo(query: string, limit: number): Promise<WebSearchItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  const results = parseDuckDuckGoHtml(html, limit);
  if (!results.length && !/\bno-results(?:__message)?\b/i.test(html)) throw new Error("DuckDuckGo 响应缺少搜索结果");
  return results;
}

export async function webSearch(rawQuery: string, options?: { limit?: number; site?: string }): Promise<WebSearchResult> {
  const baseQuery = rawQuery.trim();
  if (!baseQuery) throw new Error("请输入要搜索的关键词");
  const limit = Math.min(10, Math.max(1, Math.trunc(options?.limit ?? 6)));
  const site = options?.site?.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const query = site && !/\bsite:/i.test(baseQuery) ? `site:${site} ${baseQuery}` : baseQuery;

  const providers: Array<{ name: WebSearchProvider; run: () => Promise<WebSearchItem[]> }> = [];
  const bochaKey = (process.env.BOCHA_API_KEY ?? "").trim();
  const tavilyKey = (process.env.TAVILY_API_KEY ?? "").trim();
  if (bochaKey) providers.push({ name: "bocha", run: () => searchBocha(query, limit, bochaKey) });
  if (tavilyKey) providers.push({ name: "tavily", run: () => searchTavily(query, limit, tavilyKey) });
  providers.push(
    { name: "duckduckgo", run: () => searchDuckDuckGo(query, limit) },
    { name: "bing-global-rss", run: () => searchBingRss(query, limit, "www.bing.com") },
    { name: "bing-rss", run: () => searchBingRss(query, limit, "cn.bing.com") },
  );

  let emptyProvider: WebSearchProvider | null = null;
  for (const provider of providers) {
    try {
      const results = await provider.run();
      if (results.length > 0) {
        return { query, status: "ok", provider: provider.name, results };
      }
      emptyProvider ??= provider.name;
    } catch {
      // Try the next provider. A failed request does not establish an empty result.
    }
  }
  return { query, status: emptyProvider ? "empty" : "unavailable", provider: emptyProvider, results: [] };
}

export function extractReadableText(html: string): { title: string; description: string; content: string } {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)
    ?? html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
  const description = stripTags(descMatch?.[1] ?? "");

  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|canvas|template|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const articleMatch = stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = stripped.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  const toText = (fragment: string) => decodeHtmlEntities(
    fragment
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const articleText = articleMatch ? toText(articleMatch[1]) : "";
  const mainText = mainMatch ? toText(mainMatch[1]) : "";
  const bodyText = toText(bodyMatch?.[1] ?? stripped);

  const content = articleText.length >= 240
    ? articleText
    : mainText.length >= 240
      ? mainText
      : bodyText;

  return { title, description, content };
}

async function readLimitedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - total;
    if (remaining <= 0) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value.byteLength > remaining ? value.subarray(0, remaining) : value);
    total += Math.min(value.byteLength, remaining);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export async function fetchWebpage(rawUrl: string, options?: { maxChars?: number }): Promise<WebPageResult> {
  const maxChars = Math.min(10_000, Math.max(500, Math.trunc(options?.maxChars ?? 6_000)));
  let current = await assertPublicWebUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        accept: "text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`网页重定向缺少目标地址（HTTP ${res.status}）`);
      if (hop === MAX_REDIRECTS) throw new Error("网页重定向次数过多，已停止访问");
      current = await assertPublicWebUrl(new URL(location, current).toString());
      continue;
    }

    if (!res.ok) {
      throw new Error(`无法读取网页内容（HTTP ${res.status}）`);
    }

    const contentType = (res.headers.get("content-type") ?? "text/plain").split(";")[0].trim().toLowerCase();
    if (!/^(text\/|application\/(xhtml\+xml|json|xml))/.test(contentType)) {
      throw new Error(`该链接不是可读文本页面（${contentType}）`);
    }

    const rawText = await readLimitedText(res, MAX_HTML_BYTES);
    let title = "";
    let description = "";
    let fullContent = "";

    if (contentType.includes("html") || contentType.includes("xml")) {
      const extracted = extractReadableText(rawText);
      title = extracted.title;
      description = extracted.description;
      fullContent = extracted.content;
    } else {
      fullContent = rawText.trim();
    }

    if (!fullContent.trim()) throw new Error("网页没有可读取的正文");
    const truncated = fullContent.length > maxChars;
    const content = truncated ? `${fullContent.slice(0, maxChars)}\n…（正文过长已截断）` : fullContent;
    const url = current.toString();
    if (url.length > 4000) throw new Error("网页地址过长，无法记录查证来源");
    const id = `web_${createHash("sha256").update(JSON.stringify([url, fullContent])).digest("hex").slice(0, 24)}`;
    return {
      id,
      url,
      title: title.slice(0, 200),
      retrievedAt: new Date().toISOString(),
      description,
      content,
      truncated,
      contentType,
    };
  }

  throw new Error("网页重定向次数过多，已停止访问");
}
