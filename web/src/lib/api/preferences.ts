import { request } from "./client";

export type BriefTemplate = {
  id: string;
  name: string;
  mode: "original" | "rewrite";
  topic: string;
  category: string;
  facts: string;
  audience: string;
  tone: string;
  length: "short" | "standard" | "long";
  titleStyle: string;
  tagCount: number;
  emoji: boolean;
  instructions: string;
  angle: string;
  intensity: number;
  keepHook: boolean;
  keepParagraphs: boolean;
  keepTags: boolean;
};

export type BriefOptions = {
  categories: string[];
  audiences: string[];
  tones: string[];
  titleStyles: string[];
  angles: string[];
};

export type BriefDefaults = {
  mode: "original" | "rewrite";
  tone: string;
  length: "short" | "standard" | "long";
  titleStyle: string;
  tagCount: number;
  emoji: boolean;
  angle: string;
  intensity: number;
  keepHook: boolean;
  keepParagraphs: boolean;
  keepTags: boolean;
  instructions: string;
};

export type QuickCommand = {
  id: string;
  label: string;
  prompt: string;
  enabled: boolean;
};

export type StarterChip = {
  id: string;
  label: string;
  prompt: string;
  tone: "lavender" | "butter" | "sky" | "pink";
  enabled: boolean;
};

export type CanvasSnippet = {
  id: string;
  name: string;
  content: string;
};

export type CreatePreferences = {
  brief: {
    templates: BriefTemplate[];
    options: BriefOptions;
    defaults: BriefDefaults;
  };
  chat: {
    quickCommands: QuickCommand[];
    starterChips: StarterChip[];
    globalInstructions: string;
  };
  canvas: {
    emojis: string[];
    presetTags: string[];
    snippets: CanvasSnippet[];
    defaultView: "edit" | "preview";
    visualStylePrompt: string;
  };
};

export type UserPreferences = {
  version: 1;
  create: CreatePreferences;
};

export type PreferencesSection = "all" | "brief" | "chat" | "canvas";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
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

export const preferencesApi = {
  get: () => request<{ preferences: UserPreferences }>("/v1/creation/preferences"),
  save: (preferences: UserPreferences) =>
    request<{ preferences: UserPreferences }>("/v1/creation/preferences", {
      method: "PUT",
      body: preferences,
    }),
  reset: (section: PreferencesSection = "all") =>
    request<{ preferences: UserPreferences }>("/v1/creation/preferences/reset", {
      method: "POST",
      body: { section },
    }),
};
