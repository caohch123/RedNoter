import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicWebUrl,
  extractReadableText,
  fetchWebpage,
  isPrivateIp,
  parseBingRss,
  parseDuckDuckGoHtml,
  webSearch,
  webSourceSchema,
} from "../server/web-search.js";

test("isPrivateIp blocks loopback, private, link-local, and IPv6 ULA", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.5.1", "192.168.1.10", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateIp(ip), true, `expected private: ${ip}`);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateIp(ip), false, `expected public: ${ip}`);
  }
});

test("assertPublicWebUrl rejects local, private IP, non-http, and credentialed URLs", async () => {
  await assert.rejects(() => assertPublicWebUrl("http://localhost:3000/test"));
  await assert.rejects(() => assertPublicWebUrl("http://127.0.0.1:5557/health"));
  await assert.rejects(() => assertPublicWebUrl("http://169.254.169.254/latest/meta-data/"));
  await assert.rejects(() => assertPublicWebUrl("file:///etc/passwd"));
  await assert.rejects(() => assertPublicWebUrl("https://user:pass@example.com/"));
  const ok = await assertPublicWebUrl("https://1.1.1.1/");
  assert.equal(ok.hostname, "1.1.1.1");
});

test("parseBingRss parses XML items and decodes Bing redirect URLs", () => {
  const encoded = "a1" + Buffer.from("https://example.com/xhs-guide", "utf8").toString("base64");
  const xml = `<?xml version="1.0" encoding="utf-8"?><rss><channel>
    <item>
      <title><![CDATA[小红书 2026 爆款标题 &amp; 技巧]]></title>
      <link>https://www.bing.com/ck/a?u=${encoded}</link>
      <description>实用技巧 &lt;b&gt;总结&lt;/b&gt;</description>
      <pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;
  const items = parseBingRss(xml, 5);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "小红书 2026 爆款标题 & 技巧");
  assert.equal(items[0].url, "https://example.com/xhs-guide");
  assert.equal(items[0].snippet, "实用技巧 <b>总结</b>".replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
});

test("parseDuckDuckGoHtml extracts title, unwrapped uddg URL, and snippet", () => {
  const html = `<div class="result"><div class="result__body">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpost">测试文章标题</a>
    <a class="result__snippet">这是一段<b>摘要</b>内容</a>
  </div></div>`;
  const items = parseDuckDuckGoHtml(html, 5);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "测试文章标题");
  assert.equal(items[0].url, "https://example.org/post");
  assert.equal(items[0].snippet, "这是一段 摘要 内容");
});

test("extractReadableText strips scripts/nav and prefers article content", () => {
  const longBody = "这是正文核心内容，包含小红书写作方法和爆款结构拆解。".repeat(15);
  const html = `<html><head><title>示例标题</title><meta name="description" content="页面简介"></head>
    <body>
      <nav>导航栏不应出现</nav>
      <script>console.log("secret")</script>
      <article><h1>主标题</h1><p>${longBody}</p></article>
      <footer>页脚版权信息</footer>
    </body></html>`;
  const result = extractReadableText(html);
  assert.equal(result.title, "示例标题");
  assert.equal(result.description, "页面简介");
  assert.ok(result.content.includes("主标题"));
  assert.ok(!result.content.includes("导航栏不应出现"));
  assert.ok(!result.content.includes("console.log"));
  assert.ok(!result.content.includes("页脚版权信息"));
});

test("webSearch 区分上游失败与可用服务返回空结果", async (t) => {
  let rss: string | undefined;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (rss && url.includes("bing.com")) return new Response(rss, { status: 200 });
    throw new Error("simulated upstream failure");
  });
  const unavailable = await webSearch("模拟关键词");
  assert.deepEqual(unavailable, { query: "模拟关键词", status: "unavailable", provider: null, results: [] });
  rss = "<html><body>上游拦截页</body></html>";
  assert.deepEqual(await webSearch("模拟关键词"), unavailable);
  rss = "<rss><channel></channel></rss>";
  assert.deepEqual(await webSearch("模拟关键词"), {
    query: "模拟关键词", status: "empty", provider: "bing-global-rss", results: [],
  });
});

test("fetchWebpage 记录实际读取地址和随正文变化的来源标识", async (t) => {
  let content = "已查证的内容。".repeat(100);
  t.mock.method(globalThis, "fetch", async (url: string) => url.endsWith("/redirect")
    ? new Response(null, { status: 302, headers: { location: "/reading" } })
    : new Response(content, { headers: { "content-type": "text/plain" } }));
  const first = await fetchWebpage("https://1.1.1.1/redirect", { maxChars: 500 });
  assert.equal(first.url, "https://1.1.1.1/reading");
  assert.ok(first.truncated);
  assert.equal(webSourceSchema.parse(first).id, first.id);
  assert.equal((await fetchWebpage(first.url, { maxChars: 1000 })).id, first.id);
  content += "新增的内容。";
  assert.notEqual((await fetchWebpage(first.url)).id, first.id);
  content = "  ";
  await assert.rejects(fetchWebpage(first.url), /没有可读取的正文/);
});
