import { z } from "zod";
import { db } from "./config.js";
import type { DraftData } from "./domain.js";

function uniqueStrings(maxItems: number, maxLen: number, transform?: (value: string) => string) {
  return z
    .array(z.string())
    .transform((items) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of items) {
        const cleaned = (transform ? transform(raw) : raw.trim()).trim();
        if (!cleaned || Array.from(cleaned).length > maxLen || seen.has(cleaned)) continue;
        seen.add(cleaned);
        out.push(cleaned);
        if (out.length >= maxItems) break;
      }
      return out;
    });
}

export const briefTemplateSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1, "请填写模板名称").max(40),
  mode: z.enum(["original", "rewrite"]),
  topic: z.string().max(200).default(""),
  category: z.string().max(80).default(""),
  facts: z.string().max(4000).default(""),
  audience: z.string().max(100).default(""),
  tone: z.string().max(60).default("真诚分享"),
  length: z.enum(["short", "standard", "long"]).default("standard"),
  titleStyle: z.string().max(60).default("数字清单"),
  tagCount: z.number().int().min(3).max(10).default(6),
  emoji: z.boolean().default(true),
  instructions: z.string().max(2000).default(""),
  angle: z.string().max(100).default("换人群"),
  intensity: z.number().int().min(20).max(100).default(60),
  keepHook: z.boolean().default(true),
  keepParagraphs: z.boolean().default(true),
  keepTags: z.boolean().default(false),
});

export const briefOptionsSchema = z.object({
  categories: uniqueStrings(24, 30),
  audiences: uniqueStrings(24, 30),
  tones: uniqueStrings(24, 30),
  titleStyles: uniqueStrings(24, 30),
  angles: uniqueStrings(24, 30),
});

export const briefDefaultsSchema = z.object({
  mode: z.enum(["original", "rewrite"]).default("original"),
  tone: z.string().max(60).default("真诚分享"),
  length: z.enum(["short", "standard", "long"]).default("standard"),
  titleStyle: z.string().max(60).default("数字清单"),
  tagCount: z.number().int().min(3).max(10).default(6),
  emoji: z.boolean().default(true),
  angle: z.string().max(100).default("换人群"),
  intensity: z.number().int().min(20).max(100).default(60),
  keepHook: z.boolean().default(true),
  keepParagraphs: z.boolean().default(true),
  keepTags: z.boolean().default(false),
  instructions: z.string().max(2000).default(""),
});

export const quickCommandSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, "请填写指令名称").max(24),
  prompt: z.string().trim().min(1, "请填写提示词").max(1000),
  enabled: z.boolean().default(true),
});

export const starterChipSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, "请填写起步标题").max(24),
  prompt: z.string().trim().min(1, "请填写起步提示词").max(1000),
  tone: z.enum(["lavender", "butter", "sky", "pink"]).default("lavender"),
  enabled: z.boolean().default(true),
});

export const canvasSnippetSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1, "请填写片段名称").max(30),
  content: z.string().trim().min(1, "请填写片段正文").max(1000),
});

export const createPreferencesSchema = z.object({
  brief: z.object({
    templates: z.array(briefTemplateSchema).max(30),
    options: briefOptionsSchema,
    defaults: briefDefaultsSchema,
  }),
  chat: z.object({
    quickCommands: z.array(quickCommandSchema).max(24),
    starterChips: z.array(starterChipSchema).max(12),
    globalInstructions: z.string().max(2000).default(""),
  }),
  canvas: z.object({
    emojis: uniqueStrings(30, 8),
    presetTags: uniqueStrings(40, 30, (raw) => raw.trim().replace(/^#+\s*/, "")),
    snippets: z.array(canvasSnippetSchema).max(24),
    defaultView: z.enum(["edit", "preview"]).default("edit"),
    visualStylePrompt: z.string().max(500).default(""),
  }),
});

export const userPreferencesSchema = z.object({
  version: z.literal(1).default(1),
  create: createPreferencesSchema,
});

export type BriefTemplate = z.infer<typeof briefTemplateSchema>;
export type QuickCommand = z.infer<typeof quickCommandSchema>;
export type StarterChip = z.infer<typeof starterChipSchema>;
export type CanvasSnippet = z.infer<typeof canvasSnippetSchema>;
export type CreatePreferences = z.infer<typeof createPreferencesSchema>;
export type UserPreferencesData = z.infer<typeof userPreferencesSchema>;
export type PreferencesSection = "all" | "brief" | "chat" | "canvas";

export const DEFAULT_USER_PREFERENCES: UserPreferencesData = {
  version: 1,
  create: {
    brief: {
      templates: [
        {
          id: "tpl-default-commute",
          name: "好物种草 · 通勤包示例",
          mode: "original",
          topic: "轻量通勤托特包",
          category: "通勤箱包",
          facts: "能装下 13 寸电脑\n内袋分区清楚\n自重轻，适合日常通勤",
          audience: "早八通勤人",
          tone: "真诚分享",
          length: "standard",
          titleStyle: "数字清单",
          tagCount: 6,
          emoji: true,
          instructions: "",
          angle: "换人群",
          intensity: 60,
          keepHook: true,
          keepParagraphs: true,
          keepTags: false,
        },
        {
          id: "tpl-default-rewrite",
          name: "爆款结构仿写 · 换人群",
          mode: "rewrite",
          topic: "",
          category: "",
          facts: "",
          audience: "",
          tone: "真诚分享",
          length: "standard",
          titleStyle: "数字清单",
          tagCount: 6,
          emoji: true,
          instructions: "保留原笔记开篇反差钩子与三段式节奏，替换成目标人群真实日常场景。",
          angle: "换人群",
          intensity: 60,
          keepHook: true,
          keepParagraphs: true,
          keepTags: false,
        },
      ],
      options: {
        categories: ["通勤箱包", "服饰穿搭", "家居好物", "护肤彩妆", "食品饮品", "桌面数码", "出行体验", "其他"],
        audiences: ["早八打工人", "学生党", "宝妈", "小个子女生", "租房党"],
        tones: ["真诚分享", "轻松幽默", "专业测评", "闺蜜聊天"],
        titleStyles: ["数字清单", "反差对比", "提问式", "身份代入"],
        angles: ["换人群", "换场景", "换价格带", "换表达风格"],
      },
      defaults: {
        mode: "original",
        tone: "真诚分享",
        length: "standard",
        titleStyle: "数字清单",
        tagCount: 6,
        emoji: true,
        angle: "换人群",
        intensity: 60,
        keepHook: true,
        keepParagraphs: true,
        keepTags: false,
        instructions: "",
      },
    },
    chat: {
      quickCommands: [
        { id: "cmd-titles", label: "换 3 个爆款标题", prompt: "请先通过需求对齐卡片给出 3 个不同风格的爆款小红书标题供我选择，我选定后再应用到标题。", enabled: true },
        { id: "cmd-hook", label: "开头更有钩子", prompt: "只优化正文开头前两行，让前两行更有代入感和悬念钩子，正文其余段落逐字保留。", enabled: true },
        { id: "cmd-short", label: "压缩到 300 字", prompt: "保持核心卖点和已确认事实不变，将正文精简压缩到 300 字左右，节奏更紧凑。", enabled: true },
        { id: "cmd-casual", label: "更口语真诚", prompt: "保持原有事实和段落结构不变，把正文语言改得更像小红书真实分享，更口语自然、少广告感。", enabled: true },
        { id: "cmd-tags", label: "补充话题标签", prompt: "结合笔记主题与目标人群，优化并补充更贴合小红书搜索流量的标签。", enabled: true },
        { id: "cmd-sensitive", label: "排查敏感表达", prompt: "检查当前标题和正文是否有极限词、绝对化用语或容易踩小红书限流的表达，如有则用 edits 温和替换；没有则直接告诉我没问题。", enabled: true },
      ],
      starterChips: [
        { id: "chip-review", label: "写一篇好物种草", prompt: "我想写一篇真实好物种草小红书笔记，请先和我对齐产品核心卖点和目标人群。", tone: "lavender", enabled: true },
        { id: "chip-cards", label: "做 3 张知识卡片", prompt: "我想发一篇图文干货小红书笔记，先和我确认主题与 3 张知识卡片要呈现的核心内容，再一起出图和总结文案。", tone: "butter", enabled: true },
        { id: "chip-titles", label: "拟 3 个爆款标题", prompt: "请帮我想 3 个不同风格的小红书爆款标题备选，我选好后我们再一起写正文。", tone: "sky", enabled: true },
      ],
      globalInstructions: "",
    },
    canvas: {
      emojis: ["✨", "👜", "🙌", "💡", "👇"],
      presetTags: ["经验分享", "好物推荐", "真实测评", "日常记录", "实用指南"],
      snippets: [
        { id: "snip-question", name: "互动提问结尾", content: "👇 你们平时更看重哪一点？欢迎在评论区聊聊～" },
        { id: "snip-disclaimer", name: "真实无广声明", content: "📌 纯个人日常真实使用感受分享，无广放心看，按需种草～" },
      ],
      defaultView: "edit",
      visualStylePrompt: "",
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeUserPreferences(raw: unknown): UserPreferencesData {
  const root = isRecord(raw) ? raw : {};
  const create = isRecord(root.create) ? root.create : {};
  const brief = isRecord(create.brief) ? create.brief : {};
  const briefOptions = isRecord(brief.options) ? brief.options : {};
  const briefDefaults = isRecord(brief.defaults) ? brief.defaults : {};
  const chat = isRecord(create.chat) ? create.chat : {};
  const canvas = isRecord(create.canvas) ? create.canvas : {};

  const merged = {
    version: 1 as const,
    create: {
      brief: {
        templates: Array.isArray(brief.templates)
          ? brief.templates
          : DEFAULT_USER_PREFERENCES.create.brief.templates,
        options: {
          categories: Array.isArray(briefOptions.categories)
            ? briefOptions.categories
            : DEFAULT_USER_PREFERENCES.create.brief.options.categories,
          audiences: Array.isArray(briefOptions.audiences)
            ? briefOptions.audiences
            : DEFAULT_USER_PREFERENCES.create.brief.options.audiences,
          tones: Array.isArray(briefOptions.tones)
            ? briefOptions.tones
            : DEFAULT_USER_PREFERENCES.create.brief.options.tones,
          titleStyles: Array.isArray(briefOptions.titleStyles)
            ? briefOptions.titleStyles
            : DEFAULT_USER_PREFERENCES.create.brief.options.titleStyles,
          angles: Array.isArray(briefOptions.angles)
            ? briefOptions.angles
            : DEFAULT_USER_PREFERENCES.create.brief.options.angles,
        },
        defaults: {
          ...DEFAULT_USER_PREFERENCES.create.brief.defaults,
          ...briefDefaults,
        },
      },
      chat: {
        quickCommands: Array.isArray(chat.quickCommands)
          ? chat.quickCommands
          : DEFAULT_USER_PREFERENCES.create.chat.quickCommands,
        starterChips: Array.isArray(chat.starterChips)
          ? chat.starterChips
          : DEFAULT_USER_PREFERENCES.create.chat.starterChips,
        globalInstructions: typeof chat.globalInstructions === "string"
          ? chat.globalInstructions
          : DEFAULT_USER_PREFERENCES.create.chat.globalInstructions,
      },
      canvas: {
        emojis: Array.isArray(canvas.emojis)
          ? canvas.emojis
          : DEFAULT_USER_PREFERENCES.create.canvas.emojis,
        presetTags: Array.isArray(canvas.presetTags)
          ? canvas.presetTags
          : DEFAULT_USER_PREFERENCES.create.canvas.presetTags,
        snippets: Array.isArray(canvas.snippets)
          ? canvas.snippets
          : DEFAULT_USER_PREFERENCES.create.canvas.snippets,
        defaultView: canvas.defaultView === "preview" ? "preview" as const : "edit" as const,
        visualStylePrompt: typeof canvas.visualStylePrompt === "string"
          ? canvas.visualStylePrompt
          : DEFAULT_USER_PREFERENCES.create.canvas.visualStylePrompt,
      },
    },
  };

  return userPreferencesSchema.parse(merged);
}

export function resetPreferencesSection(
  current: UserPreferencesData,
  section: PreferencesSection,
): UserPreferencesData {
  if (section === "all") return structuredClone(DEFAULT_USER_PREFERENCES);
  return {
    ...current,
    create: {
      ...current.create,
      [section]: structuredClone(DEFAULT_USER_PREFERENCES.create[section]),
    },
  };
}

export function applyBriefDefaultsToDraft(base: DraftData, prefs: UserPreferencesData): DraftData {
  const defaults = prefs.create.brief.defaults;
  return {
    ...base,
    settings: {
      ...base.settings,
      mode: defaults.mode,
      tone: defaults.tone,
      length: defaults.length,
      titleStyle: defaults.titleStyle,
      tagCount: defaults.tagCount,
      emoji: defaults.emoji,
      angle: defaults.angle,
      intensity: defaults.intensity,
      keepHook: defaults.keepHook,
      keepParagraphs: defaults.keepParagraphs,
      keepTags: defaults.keepTags,
      instructions: defaults.instructions,
    },
  };
}

export async function loadUserPreferences(ownerId: string): Promise<UserPreferencesData> {
  const row = await db.userPreferences.findUnique({ where: { ownerId } });
  if (!row) return structuredClone(DEFAULT_USER_PREFERENCES);
  try {
    return normalizeUserPreferences(row.data);
  } catch {
    return structuredClone(DEFAULT_USER_PREFERENCES);
  }
}

export async function saveUserPreferences(ownerId: string, raw: unknown): Promise<UserPreferencesData> {
  const normalized = userPreferencesSchema.parse(raw);
  await db.userPreferences.upsert({
    where: { ownerId },
    create: { ownerId, data: normalized },
    update: { data: normalized },
  });
  return normalized;
}
