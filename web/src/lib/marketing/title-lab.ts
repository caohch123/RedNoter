/**
 * 官网上的「标题公式」和「标题体检」：纯前端的规则，不调用 AI。
 * 用在首屏「摘下这颗星」、作品详情的「换个写法」和结尾的「标题体检」里。
 * 规则只作参考，不代表实际流量；真正的 AI 改写在登录后的工作区里。
 */

/** 小红书标题的字数上限 */
export const TITLE_LIMIT = 20;

/** 按字符数计算长度（emoji 算一个字） */
export const titleLength = (text: string) => Array.from(text).length;

/** 简单的字符串哈希，让同一个主题每次得到同样的结果（服务端和浏览器一致） */
function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

const CROWDS = ["新手", "打工人", "学生党", "懒人", "上班族"];

const CROWD_WORDS = [
  "打工人", "学生党", "宝妈", "新手", "小白", "女生", "男生", "小个子", "上班族", "早八", "租房",
  "懒人", "姐妹", "敏感肌", "油皮", "干皮", "社恐", "i人", "e人", "独居", "考研", "大学生", "职场",
];
const hasCrowd = (text: string) => CROWD_WORDS.some((w) => text.toLowerCase().includes(w.toLowerCase()));

export type TitleIdea = { formula: string; title: string };

/**
 * 每条公式都尽量满足体检里的几条规则，主题词在 8 个字以内时不超过 20 字。
 * 主题里已经有人群词（如「学生党平价护肤」）时，不再另加一个人群。
 */
const FORMULAS: { name: string; make: (topic: string, crowd: string, n: number) => string }[] = [
  { name: "数字清单", make: (t, c, n) => (hasCrowd(t) ? `${t}必看｜${n} 个小技巧` : `${c}必看｜${n} 个${t}小技巧`) },
  { name: "反差悬念", make: (t) => `原来${t}这么简单！后悔没早试` },
  { name: "人群共鸣", make: (t, c) => (hasCrowd(t) ? `${t}看过来！真的绝了` : `${c}请进！${t}真的绝了`) },
  { name: "情绪种草", make: (t) => `谁懂啊！${t}也太治愈了吧` },
  { name: "亲身经历", make: (t, _c, n) => `${t}｜过来人的 ${n} 条真心话` },
];

/** 按几种常见的标题公式给出换个写法，count 条，公式不重复 */
export function rewriteTitles(topic: string, count = 3): TitleIdea[] {
  const t = topic.trim() || "你的主题";
  const h = hash(t);
  const crowd = CROWDS[h % CROWDS.length];
  const n = 3 + (h % 5);
  const start = h % FORMULAS.length;
  return Array.from({ length: Math.min(count, FORMULAS.length) }, (_, i) => {
    const f = FORMULAS[(start + i) % FORMULAS.length];
    return { formula: f.name, title: f.make(t, crowd, n) };
  });
}

/** 从一句标题里取出主题词：按标点切开，取最长的一段，最多 8 个字 */
export function topicOf(title: string) {
  const parts = title
    .split(/[，,。.！!？?｜|、\s~～…]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const longest = parts.sort((a, b) => titleLength(b) - titleLength(a))[0] ?? "";
  return Array.from(longest).slice(0, 8).join("");
}

const EMOTION_WORDS = [
  "绝了", "真的", "谁懂", "救命", "后悔", "治愈", "爱了", "宝藏", "惊艳", "天花板", "不踩雷", "私藏",
  "太香", "好用", "出片", "上头", "封神", "必看", "值得", "哭了", "氛围感", "松弛感", "真心话",
];

export type TitleCheck = { id: string; label: string; pass: boolean; tip: string };

/** 标题体检：五条常用规则，每通过一条摘一颗星 */
export function checkTitle(title: string): TitleCheck[] {
  const text = title.trim();
  const len = titleLength(text);
  return [
    {
      id: "length",
      label: `字数合适（${len} / ${TITLE_LIMIT}）`,
      pass: len > 0 && len <= TITLE_LIMIT,
      tip: len > TITLE_LIMIT ? "超过 20 个字会被截断，试着删掉修饰词" : "小红书标题最多 20 个字",
    },
    {
      id: "number",
      label: "有具体数字",
      pass: /[0-9０-９]|[一二三四五六七八九十两]+\s*(个|天|件|款|步|种|分钟|小时|周|月|年|套|招|篇|元|块)/.test(text),
      tip: "「5 个技巧」「30 天」这类数字让人一眼知道能得到什么",
    },
    {
      id: "crowd",
      label: "点名了人群",
      pass: hasCrowd(text),
      tip: "加上「学生党」「打工人」这类身份词，对的人更容易点进来",
    },
    {
      id: "emotion",
      label: "有情绪或口语感",
      pass: EMOTION_WORDS.some((w) => text.includes(w)),
      tip: "像跟朋友说话一样，「真的」「谁懂」比书面语更有感染力",
    },
    {
      id: "rhythm",
      label: "有节奏符号或表情",
      pass: /[｜|！!？?…]|\p{Extended_Pictographic}/u.test(text),
      tip: "用「｜」「！」把标题断成两拍，读起来更有节奏",
    },
  ];
}
