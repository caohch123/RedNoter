import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { draftSchema, emptyDraft } from "../server/domain.js";
import { createStarExtension } from "../server/pi/star-extension.js";
import {
  extractXhsLink,
  isAllowedXhsMediaHost,
  isAllowedXhsPageHost,
  isPublicIp,
  mapCollectionError,
  parseCount,
  parseXhsNote,
  signMediaUrl,
  verifyMediaSignature,
  XhsError,
} from "../server/xhs.js";
import { parseXhsNoteOutput } from "../web/src/components/creation/pi/note-diff.js";
import { formatPreviewBody } from "../web/src/components/creation/xhs-format.js";
import {
  buildReferenceMarkdown,
  extractCleanBody,
  referenceMarkdownFilename,
} from "../server/reference-import.js";

test("extractXhsLink 从分享文案提取合法小红书链接并拦截非法地址", () => {
  assert.equal(
    extractXhsLink("快来看这篇宝藏分享！http://xhslink.com/a/abc123XYZ，复制打开小红书"),
    "http://xhslink.com/a/abc123XYZ",
  );
  assert.equal(
    extractXhsLink("https://xhslink.cn/o/test999！"),
    "https://xhslink.cn/o/test999",
  );
  assert.equal(
    extractXhsLink("笔记链接 https://www.xiaohongshu.com/explore/66abcdef0123456789abcdef?xsec_token=tok1&xsec_source=pc_feed。"),
    "https://www.xiaohongshu.com/explore/66abcdef0123456789abcdef?xsec_token=tok1&xsec_source=pc_feed",
  );
  assert.equal(
    extractXhsLink("https://xiaohongshu.com/discovery/item/66abcdef0123456789abcdef?xsec_token=tok2"),
    "https://xiaohongshu.com/discovery/item/66abcdef0123456789abcdef?xsec_token=tok2",
  );
  assert.equal(
    extractXhsLink("https://www.xiaohongshu.com/user/profile/uid1/note999"),
    "https://www.xiaohongshu.com/user/profile/uid1/note999",
  );
  assert.equal(
    extractXhsLink("www.xiaohongshu.com/explore/66abcdef0123456789abcdef?xsec_token=bare1"),
    "https://www.xiaohongshu.com/explore/66abcdef0123456789abcdef?xsec_token=bare1",
  );
  assert.equal(
    extractXhsLink("复制打开 xhslink.com/a/bareShort123，看详情"),
    "https://xhslink.com/a/bareShort123",
  );

  const invalidInputs = [
    "没有链接的一段普通文字",
    "https://v.douyin.com/abc123/",
    "https://www.xiaohongshu.com:8443/explore/66abcdef",
    "https://user:pass@www.xiaohongshu.com/explore/66abcdef",
    "https://www.xiaohongshu.com/user/profile/uid1",
    "https://www.xiaohongshu.com.evil.test/explore/66abcdef",
    "evil.www.xiaohongshu.com/explore/66abcdef",
  ];
  for (const input of invalidInputs) {
    assert.throws(() => extractXhsLink(input), XhsError);
  }
});

test("SSRF IPv4/IPv6 公网校验与域名白名单准确拦截内网及伪造域名", () => {
  assert.equal(isPublicIp("81.69.116.102"), true);
  assert.equal(isPublicIp("1.1.1.1"), true);
  assert.equal(isPublicIp("2400:da00::6666"), true);

  for (const blocked of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "100.100.2.3",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.5",
    "not-an-ip",
  ]) {
    assert.equal(isPublicIp(blocked), false, `should reject ${blocked}`);
  }

  assert.equal(isAllowedXhsPageHost("www.xiaohongshu.com"), true);
  assert.equal(isAllowedXhsPageHost("xhslink.com"), true);
  assert.equal(isAllowedXhsPageHost("xiaohongshu.com.evil.com"), false);

  assert.equal(isAllowedXhsMediaHost("sns-img-bd.xhscdn.com"), true);
  assert.equal(isAllowedXhsMediaHost("ci.xiaohongshu.com"), true);
  assert.equal(isAllowedXhsMediaHost("xhscdn.com.attacker.test"), false);
});

test("parseCount 正确解析数字、逗号和万/w 单位", () => {
  assert.equal(parseCount("1.2万"), 12000);
  assert.equal(parseCount("3.5w"), 35000);
  assert.equal(parseCount("1,234"), 1234);
  assert.equal(parseCount(88), 88);
  assert.equal(parseCount("-1"), null);
  assert.equal(parseCount("未知"), null);
});

test("mapCollectionError 映射所有 12 种错误码并保持中文可理解提示", () => {
  const codes = [
    "network_unreachable",
    "tls_error",
    "login_required",
    "access_restricted",
    "note_unavailable",
    "rate_limited",
    "missing_share_token",
    "page_unrecognized",
    "parse_failed",
    "unsafe_redirect",
    "too_many_redirects",
    "upstream_error",
  ];
  for (const code of codes) {
    const err = mapCollectionError(code);
    assert.ok(err instanceof XhsError);
    assert.ok(err.message.length >= 10);
    assert.doesNotMatch(err.message, /start\.cmd/);
  }
});

test("HMAC 媒体签名校验防止 URL 与签名篡改", () => {
  const prevToken = process.env.XHS_COLLECTOR_TOKEN;
  process.env.XHS_COLLECTOR_TOKEN = "unit-test-collector-secret-token";
  try {
    const url = "https://sns-img-bd.xhscdn.com/spectrum/123456";
    const sig = signMediaUrl(url);
    assert.equal(verifyMediaSignature(url, sig), true);
    assert.equal(verifyMediaSignature(`${url}?evil=1`, sig), false);
    assert.equal(verifyMediaSignature(url, "0".repeat(64)), false);
    assert.equal(verifyMediaSignature(url, "bad"), false);
  } finally {
    if (prevToken === undefined) delete process.env.XHS_COLLECTOR_TOKEN;
    else process.env.XHS_COLLECTOR_TOKEN = prevToken;
  }
});

test("draftSchema 对缺失或携带 referenceMeta 的草稿向后兼容", () => {
  const legacy = draftSchema.parse({
    ...emptyDraft,
    settings: {
      ...emptyDraft.settings,
      referenceMeta: undefined,
    },
  });
  assert.equal(legacy.settings.referenceMeta, null);

  const withMeta = draftSchema.parse({
    ...emptyDraft,
    settings: {
      ...emptyDraft.settings,
      mode: "rewrite",
      referenceMeta: {
        platform: "xiaohongshu",
        noteId: "66abcdef",
        url: "https://www.xiaohongshu.com/explore/66abcdef",
        noteType: "image",
        author: "测试作者",
        likes: 1200,
        images: [{ url: "https://sns-img-bd.xhscdn.com/a.jpg", sig: "a".repeat(64), role: "media" }],
      },
    },
  });
  assert.equal(withMeta.settings.referenceMeta?.noteId, "66abcdef");
  assert.equal(withMeta.settings.referenceMeta?.images.length, 1);
});

describeMockCollectorTests();

function describeMockCollectorTests() {
  let server: http.Server;
  let port = 0;
  let handler: (body: Record<string, unknown>, headers: http.IncomingHttpHeaders) => { status: number; json: unknown };
  const prevUrl = process.env.XHS_COLLECTOR_URL;
  const prevToken = process.env.XHS_COLLECTOR_TOKEN;

  before(async () => {
    handler = () => ({ status: 200, json: { data: {} } });
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
        const result = handler(body, req.headers);
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(JSON.stringify(result.json));
      });
    });
    await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", () => resolveReady()));
    port = (server.address() as { port: number }).port;
    process.env.XHS_COLLECTOR_URL = `http://127.0.0.1:${port}`;
    process.env.XHS_COLLECTOR_TOKEN = "mock-collector-token-123";
  });

  after(async () => {
    if (prevUrl === undefined) delete process.env.XHS_COLLECTOR_URL;
    else process.env.XHS_COLLECTOR_URL = prevUrl;
    if (prevToken === undefined) delete process.env.XHS_COLLECTOR_TOKEN;
    else process.env.XHS_COLLECTOR_TOKEN = prevToken;
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  });

  test("parseXhsNote 调用模拟采集服务解析图文笔记、校验只匿名参数并签发图片签名", async () => {
    let seenHeaders: http.IncomingHttpHeaders = {};
    let seenBody: Record<string, unknown> = {};
    handler = (body, headers) => {
      seenBody = body;
      seenHeaders = headers;
      return {
        status: 200,
        json: {
          data: {
            "作品ID": "66a1b2c3d4e5f60001020304",
            "作品标题": "早八通勤包实测",
            "作品描述": "第一段体验分享\n\n第二段细节补充 #通勤好物",
            "作品标签": "通勤穿搭 好物分享 #打工人日常",
            "作品类型": "图文",
            "发布时间": "2026-10-01_09:00:00",
            "作者昵称": "米粒同学",
            "作者ID": "user123",
            "点赞数量": "1.2万",
            "收藏数量": "860",
            "评论数量": "45",
            "分享数量": "12",
            "下载地址": [
              "https://sns-img-bd.xhscdn.com/pic1.jpg",
              "http://127.0.0.1/evil.jpg",
              "https://ci.xiaohongshu.com/pic2.jpg",
            ],
          },
        },
      };
    };

    const note = await parseXhsNote("https://www.xiaohongshu.com/explore/66a1b2c3d4e5f60001020304?xsec_token=test");
    assert.equal(seenHeaders["x-collector-token"], "mock-collector-token-123");
    assert.equal(seenBody.download, false);
    assert.equal(seenBody.check_record, false);
    assert.equal(seenBody.cookie, "");
    assert.equal(note.noteId, "66a1b2c3d4e5f60001020304");
    assert.equal(note.noteType, "image");
    assert.equal(note.author, "米粒同学");
    assert.equal(note.likes, 12000);
    assert.equal(note.favorites, 860);
    assert.equal(note.comments, 45);
    assert.deepEqual(note.tags, ["通勤穿搭", "好物分享", "打工人日常"]);
    assert.equal(note.images.length, 2);
    assert.equal(verifyMediaSignature(note.images[0].url, note.images[0].sig), true);
    assert.match(note.referenceText, /^早八通勤包实测\n\n第一段体验分享/);
  });

  test("parseXhsNote 正确映射模拟采集服务返回的错误码", async () => {
    handler = () => ({ status: 200, json: { data: {}, error_code: "login_required" } });
    await assert.rejects(
      () => parseXhsNote("https://www.xiaohongshu.com/explore/66a1b2c3d4e5f60001020304?xsec_token=abc"),
      (err: unknown) => err instanceof XhsError && err.code === "LOGIN_REQUIRED",
    );
  });

  test("parseXhsNote 对无 xsec_token 裸链接自动尝试 /discovery/item/<id> 兜底并在失败时给出指引", async () => {
    const requestedUrls: string[] = [];
    handler = (body) => {
      const url = String(body.url ?? "");
      requestedUrls.push(url);
      if (url.includes("/discovery/item/")) {
        return {
          status: 200,
          json: {
            data: {
              "作品ID": "66a1b2c3d4e5f60001020304",
              "作品标题": "兜底解析成功",
              "作品描述": "通过 discovery/item 成功取得公开笔记正文。",
              "作品标签": "兜底测试",
              "作品类型": "图文",
            },
          },
        };
      }
      return { status: 200, json: { data: {}, error_code: "missing_share_token" } };
    };

    const ok = await parseXhsNote("https://www.xiaohongshu.com/explore/66a1b2c3d4e5f60001020304");
    assert.deepEqual(requestedUrls, [
      "https://www.xiaohongshu.com/explore/66a1b2c3d4e5f60001020304",
      "https://www.xiaohongshu.com/discovery/item/66a1b2c3d4e5f60001020304",
    ]);
    assert.equal(ok.title, "兜底解析成功");

    // 兜底也无法拿到内容时，应返回带分享复制指引的 MISSING_SHARE_TOKEN 错误
    requestedUrls.length = 0;
    handler = (body) => {
      requestedUrls.push(String(body.url ?? ""));
      return { status: 200, json: { data: {}, error_code: "page_unrecognized" } };
    };
    await assert.rejects(
      () => parseXhsNote("https://www.xiaohongshu.com/explore/66a1b2c3d4e5f60001020304"),
      (err: unknown) => err instanceof XhsError && err.code === "MISSING_SHARE_TOKEN" && err.message.includes("xsec_token"),
    );
    assert.equal(requestedUrls.length, 2);
  });
}

test("star_fetch_xhs_note 工具输出受 12000 字符上限保护且 parseXhsNoteOutput 可无损重建", async () => {
  type RegisteredTool = {
    name: string;
    execute: (id: string, params: unknown) => Promise<{ content: { type: string; text: string }[] }>;
  };
  const tools = new Map<string, RegisteredTool>();
  const longBody = "这是一段很长的小红书实测分享内容。".repeat(450); // > 7600 chars
  const manyImages = Array.from({ length: 15 }, (_, idx) => ({
    url: `https://sns-img-bd.xhscdn.com/spectrum/${"x".repeat(60)}-${idx}.jpg`,
    sig: "b".repeat(64),
    role: "media" as const,
  }));

  const extension = createStarExtension({
    draftId: "11111111-1111-4111-8111-111111111111",
    async readNote() {
      return {
        title: "", body: "", tags: [], revision: 1,
        facts: "", audience: "", mode: "rewrite", topic: "", referenceTitle: null,
      };
    },
    async stageNote() {
      return { runId: "22222222-2222-4222-8222-222222222222", revision: 1 };
    },
    async askUser() {
      return { answers: {}, useRecommended: true };
    },
    async parseXhsNote() {
      return {
        noteId: "note-long-1",
        url: "https://www.xiaohongshu.com/explore/note-long-1",
        title: "超长笔记测试",
        body: longBody,
        tags: ["好物", "实测"],
        noteType: "image",
        author: "测评君",
        authorId: "u1",
        publishedAt: "2026-11-20_10:00:00",
        likes: 520,
        favorites: 310,
        comments: 18,
        shares: 9,
        images: manyImages,
        videoUrl: null,
        referenceText: `超长笔记测试\n\n${longBody}`.slice(0, 8000),
        referenceTitle: "超长笔记测试",
        referenceTags: ["好物", "实测"],
        meta: {
          platform: "xiaohongshu",
          noteId: "note-long-1",
          url: "https://www.xiaohongshu.com/explore/note-long-1",
          noteType: "image",
          author: "测评君",
          publishedAt: "2026-11-20_10:00:00",
          likes: 520,
          favorites: 310,
          comments: 18,
          shares: 9,
          images: manyImages,
        },
      };
    },
  });

  extension.factory({
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as unknown as ExtensionAPI);

  const tool = tools.get("star_fetch_xhs_note")!;
  assert.ok(tool);
  const res = await tool.execute("x1", { text: "https://www.xiaohongshu.com/explore/note-long-1?xsec_token=abc" });
  const rawJson = res.content[0].text;
  assert.ok(rawJson.length < 12_000, `tool JSON length ${rawJson.length} must stay below MAX_STRING 12000`);

  const parsed = parseXhsNoteOutput(rawJson);
  assert.ok(parsed);
  assert.equal(parsed.noteId, "note-long-1");
  assert.equal(parsed.meta.author, "测评君");
  assert.equal(parsed.meta.likes, 520);
  assert.ok(parsed.meta.images.length >= 6);
  assert.ok(parsed.referenceText.startsWith("超长笔记测试\n\n"));
});

test("reference-import 纯函数正确清理标题重复、生成文件名与完整 Markdown 文档", () => {
  assert.equal(
    extractCleanBody("我和蔡徐坤\n\n有点想固定追了哈哈～", "我和蔡徐坤"),
    "有点想固定追了哈哈～",
  );
  assert.equal(
    extractCleanBody("独立正文第一行\n\n第二行", "我和蔡徐坤"),
    "独立正文第一行\n\n第二行",
  );
  assert.equal(
    extractCleanBody("我和蔡徐坤", "我和蔡徐坤"),
    "我和蔡徐坤",
  );

  const xhsSettings = {
    reference: "我和蔡徐坤\n\n有点想固定追了哈哈～ 月底看演唱会去",
    referenceTitle: "我和蔡徐坤",
    referenceTags: ["蔡徐坤", "追星"],
    referenceMeta: {
      platform: "xiaohongshu" as const,
      noteId: "66a1b2c3d4",
      url: "https://www.xiaohongshu.com/explore/66a1b2c3d4",
      noteType: "image" as const,
      author: "yo子小号",
      publishedAt: "2026-11-20_10:00:00",
      likes: 3100,
      favorites: 166,
      comments: 615,
      shares: null,
      images: [{ url: "https://sns-img-bd.xhscdn.com/pic1.jpg", sig: "a".repeat(64), role: "media" as const }],
    },
  };

  assert.equal(referenceMarkdownFilename(xhsSettings), "xhs-66a1b2c3d4-参考笔记.md");

  const md = buildReferenceMarkdown(
    xhsSettings,
    ["xhs-ref/xhs-66a1b2c3d4-图1.jpg"],
    [{ label: "标题结构", detail: "直白关系型标题触发好奇。" }],
  );
  assert.match(md, /^# 我和蔡徐坤/);
  assert.match(md, /@yo子小号/);
  assert.match(md, /赞 3100 \/ 藏 166 \/ 评 615/);
  assert.match(md, /#蔡徐坤 #追星/);
  assert.match(md, /## 完整正文\n有点想固定追了哈哈～ 月底看演唱会去/);
  assert.doesNotMatch(md, /## 完整正文\n我和蔡徐坤\n/);
  assert.match(md, /`xhs-ref\/xhs-66a1b2c3d4-图1\.jpg`/);
  assert.match(md, /- \*\*标题结构\*\*：直白关系型标题触发好奇。/);

  const plainSettings = {
    reference: "纯文本笔记标题\n\n正文内容段",
    referenceTitle: "纯文本笔记标题",
    referenceTags: [],
    referenceMeta: null,
  };
  assert.match(referenceMarkdownFilename(plainSettings), /^ref-[0-9a-f]{8}-参考笔记\.md$/);
  const plainMd = buildReferenceMarkdown(plainSettings);
  assert.match(plainMd, /手动粘贴参考笔记/);
  assert.match(plainMd, /正文内容段/);
});

test("formatPreviewBody 清理紧贴正文末尾的 #标签[话题]# 重复片段并保留中段文案", () => {
  assert.equal(
    formatPreviewBody("有点想固定追了哈哈～ 月底看演唱会去#蔡徐坤[话题]# #追星[话题]#", ["蔡徐坤", "追星"]),
    "有点想固定追了哈哈～ 月底看演唱会去",
  );
  assert.equal(
    formatPreviewBody("第一行分享\n\n#蔡徐坤[话题]# #追星[话题]#\n#演唱会", ["蔡徐坤", "追星"]),
    "第一行分享",
  );
  assert.equal(
    formatPreviewBody("文中提到的 #蔡徐坤[话题]# 舞台超稳\n\n#蔡徐坤[话题]#", ["蔡徐坤"]),
    "文中提到的 #蔡徐坤 舞台超稳",
  );
  assert.equal(
    formatPreviewBody("没有提取标签时 #保留[话题]# 原样清理后缀", []),
    "没有提取标签时 #保留 原样清理后缀",
  );
});
