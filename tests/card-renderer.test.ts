import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCardHtml,
  cardHeight,
  cardSpecSchema,
  cardWidth,
  renderCardsToPng,
  sanitizeCardCss,
  sanitizeCardHtml,
} from "../server/card-renderer.js";

test("sanitizeCardHtml 与 sanitizeCardCss 剥离脚本、外链并保留安全样式与 data URI 图片", () => {
  const dirtyHtml = `
    <div onclick="alert(1)" style="background: linear-gradient(#fff, #eee); background-image: url('https://evil.com/x.png')">
      <h1>安全标题</h1>
      <script>fetch('https://evil.com')</script>
      <iframe src="https://evil.com"></iframe>
      <a href="javascript:alert(2)">链接</a>
      <img src="https://evil.com/tracker.png" onerror="alert(3)" />
      <img src="data:image/png;base64,AAAA" alt="ok" />
      <style>@import url("https://evil.com/x.css"); body { color: red; } </style><script>alert(4)</script>
    </div>
  `;
  const cleanHtml = sanitizeCardHtml(dirtyHtml);
  assert.doesNotMatch(cleanHtml, /<script/i);
  assert.doesNotMatch(cleanHtml, /<iframe/i);
  assert.doesNotMatch(cleanHtml, /onclick=/i);
  assert.doesNotMatch(cleanHtml, /onerror=/i);
  assert.doesNotMatch(cleanHtml, /javascript:/i);
  assert.doesNotMatch(cleanHtml, /evil\.com/i);
  assert.doesNotMatch(cleanHtml, /@import/i);
  assert.match(cleanHtml, /安全标题/);
  assert.match(cleanHtml, /linear-gradient/);
  assert.match(cleanHtml, /data:image\/png;base64,AAAA/);

  const dirtyCss = `@import "x.css"; .card { background: url(https://evil.com/a.jpg); color: #111; } </style><script>alert(1)</script>`;
  const cleanCss = sanitizeCardCss(dirtyCss);
  assert.doesNotMatch(cleanCss, /@import/i);
  assert.doesNotMatch(cleanCss, /evil\.com/i);
  assert.doesNotMatch(cleanCss, /<\/style/i);
  assert.match(cleanCss, /color: #111/);
});

test("buildCardHtml 支持四套模板、严格转义文本并包含 CSP 防护与 IPA 音标", () => {
  const vocab = cardSpecSchema.parse({
    template: "vocab",
    word: "ambiguous <script>",
    phonetic: "/æmˈbɪɡjuəs/",
    pos: "adj.",
    meaning: "模棱两可的；含糊不清的",
    example: "His reply was ambiguous.",
    tip: "ambi（两边）+ ag（走）→ 走两边即含糊",
  });
  const vocabHtml = buildCardHtml(vocab);
  assert.match(vocabHtml, /Content-Security-Policy/);
  assert.match(vocabHtml, /default-src 'none'/);
  assert.match(vocabHtml, /\/æmˈbɪɡjuəs\//);
  assert.match(vocabHtml, /ambiguous &lt;script&gt;/);
  assert.doesNotMatch(vocabHtml, /<script>alert/);

  const listHtml = buildCardHtml(cardSpecSchema.parse({
    template: "list",
    theme: "mint",
    title: "雅思阅读高频替换",
    items: [{ label: "substantial", detail: "大量的；实质性的", tag: "高频" }],
  }));
  assert.match(listHtml, /雅思阅读高频替换/);
  assert.match(listHtml, /substantial/);

  const compareHtml = buildCardHtml(cardSpecSchema.parse({
    template: "compare",
    theme: "ink",
    title: "口语低分 vs 高分表达",
    left: { label: "普通表达", items: ["a lot of"] },
    right: { label: "高分替换", items: ["a substantial amount of"] },
  }));
  assert.match(compareHtml, /a substantial amount of/);

  const quoteHtml = buildCardHtml(cardSpecSchema.parse({
    template: "quote",
    theme: "night",
    quote: "少背冷门词，把核心高频词用到写作里。",
    author: "雅思备考笔记",
  }));
  assert.match(quoteHtml, /把核心高频词用到写作里/);
});

test("renderCardsToPng 调用本机浏览器输出精确 1080×1440 (3:4) PNG 图片", async () => {
  const specs = [
    cardSpecSchema.parse({
      template: "vocab",
      theme: "cream",
      badge: "01 / 03 · 雅思核心词",
      word: "ambiguous",
      phonetic: "/æmˈbɪɡjuəs/",
      pos: "adj.",
      meaning: "模棱两可的；含糊不清的",
      example: "The wording of the clause is somewhat ambiguous.",
      exampleZh: "这项条款的措辞有些含糊不清。",
    }),
    cardSpecSchema.parse({
      template: "vocab",
      theme: "mint",
      badge: "02 / 03 · 雅思核心词",
      word: "deteriorate",
      phonetic: "/dɪˈtɪəriəreɪt/",
      pos: "v.",
      meaning: "恶化；变坏",
      example: "Air quality began to deteriorate rapidly.",
      exampleZh: "空气质量开始迅速恶化。",
    }),
    cardSpecSchema.parse({
      template: "vocab",
      theme: "ink",
      badge: "03 / 03 · 雅思核心词",
      word: "substantial",
      phonetic: "/səbˈstænʃl/",
      pos: "adj.",
      meaning: "大量的；实质性的",
      example: "There has been a substantial rise in applications.",
      exampleZh: "申请人数出现了大幅增长。",
    }),
  ];

  const buffers = await renderCardsToPng(specs);
  assert.equal(buffers.length, 3);
  for (const buf of buffers) {
    assert.ok(buf.byteLength > 10_000, `Expected PNG > 10KB, got ${buf.byteLength}`);
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(width, cardWidth, `Expected width ${cardWidth}, got ${width}`);
    assert.equal(height, cardHeight, `Expected height ${cardHeight}, got ${height}`);
  }
});
