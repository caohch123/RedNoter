import { creativeTaskSchema, type CreativeTask, type DraftData } from "./domain.js";

const consultations = /^(?:请问|如何|怎样|怎么|为什么|是不是|你觉得|你怎么看|有(?:什么|何)建议|能否说明)|(?:怎么写|如何写|怎么样|怎么做|可以吗)[？?。！!]*$/u;
const requestPrefix = /^(?:(?:请(?:你)?|帮我|麻烦(?:你)?|我想(?:要|让你)?|给我|能不能|可以|现在|直接|先)\s*)+/u;
const writingVerb = /^(?:写|撰写|起草|起稿|生成|创作|做|出)(?:一?[篇条份个则]|一?下)?/u;
const writingAction = /(?:写|撰写|起草|起稿|生成|创作|做|出)(?:一[篇条份个则]|一?下)?/u;
const writingOutput = /(?:小红书|笔记|文案|种草文|推广文|广告稿)/u;
const otherTurn = /^(?:你好|您好|你是谁|嗨|在吗|早上好|谢谢|换个话题|不用了|取消|帮我(?:查|算|翻译)|给我(?:讲|查)|聊聊|[今明昨]天天气)/u;
const acceptedDefaults = /^(?:好|好的|行|嗯|可以|就这样|继续|没有补充)$/u;
const styleOnly = /^(?:轻松|活泼|口语化|搞笑|自然|正式|简洁|短)(?:[一亿]点|一些)?$|^\d+\s*(?:字|字以内)$/u;
const coverOutput = /封面/u;
const excludedCover = /(?:无需|不用|不要|不需要|不必|去掉)\s*(?:生成|制作|安排)?\s*封面/u;
const mediaNoun = /封面(?:图|图片)?|配图|插图|图片|短片|视频|图解|张图/g;
const mediaBan = /无需|不用|不需要|不必|不要|禁止|去掉|别(?:再|生成|做|加)?/u;
const mediaAction = /生成|制作|绘制|设计|配[一两二三四五六七八九十\d]?|画|做|加[上入个张]|需要|都要|也要|还要|给我|附[上带]|要有|输出|产出/u;
const chineseNumbers = "〇一二三四五六七八九十";
const videoAsText = /^(?:剪辑|脚本|文案|口播|策划|教程|素材|分镜|内容|号|的(?:标题|正文|文案|教程|脚本|笔记))/u;

type Deliverable = NonNullable<CreativeTask["media"]>[number];
export function mediaRequirements(request: string) {
  const required: Deliverable[] = [];
  const excluded = new Set<Deliverable>();
  if (/(?:只要|只写|仅要|只出)(?:文案|正文|文字)|(?:无需|不需要|不要|不用)(?:生成|制作|添加)?(?:任何)?(?:媒体|素材|视觉内容)/u.test(request)) {
    for (const kind of ["cover", "image", "video"] as const) excluded.add(kind);
  }
  if (/图片或视频|视频或图片|配图或视频|视频或配图/u.test(request) &&
    /(?:你|star).{0,8}(?:决定|判断|选择|看着办)|任选|二选一|看情况/u.test(request)) {
    return { required, excluded: [...excluded], delegated: true };
  }
  for (const segment of request.split(/[，。；！？\n,;!?]/u)) {
    let offset = 0;
    let carry = false;
    let deniedInList = false;
    const sharedAction = /(?:都要|都需要|各来一份)$/u.test(segment);
    for (const match of segment.matchAll(mediaNoun)) {
      const noun = match[0];
      const index = match.index;
      const before = segment.slice(offset, index);
      const after = segment.slice(index + noun.length);
      offset = index + noun.length;
      if (videoAsText.test(after) || /(?:参考|现有|已有)(?:的)?$/u.test(before) || /^.{0,4}(?:作为参考|用来参考)/u.test(after)) continue;
      const kind = noun.startsWith("封面") ? "cover" : /视频|短片/u.test(noun) ? "video" : "image";
      const listed = /^(?:\s|的|和|与|及|、|或|以及)*(?:(?:\d+|[一二三四五六七八九十两])(?:张|段|个|条))?\s*$/u.test(before);
      const denied: boolean = mediaBan.test(before) || (listed && deniedInList);
      deniedInList = denied;
      if (denied) { excluded.add(kind); continue; }
      const explicit = mediaAction.test(before) || sharedAction || /(?:也要|也生成)$/u.test(after) ||
        (listed && carry) || /^[\s的]*(?:和|与|及|、)?(?:文案|正文)(?:都要|也要|一起)/u.test(after);
      if (!explicit || /(?:关于|围绕|讲讲|如何|怎样|怎么)[^，。]{0,12}$/u.test(before)) continue;
      carry = true;
      const count = /(\d+|[一二三四五六七八九十两])\s*张/u.exec(before)?.[1] ??
        (noun === "张图" ? /(\d+|[一二三四五六七八九十两])\s*$/u.exec(before)?.[1] : undefined);
      const amount = kind === "image" && count ? Math.max(1, Math.min(9, Number(count) || (count === "两" ? 2 : chineseNumbers.indexOf(count)))) : 1;
      if (kind === "image" || !required.includes(kind)) required.push(...Array.from({ length: amount }, () => kind));
    }
  }
  const limits = { image: 9, cover: 1, video: 1 };
  return { required: required.filter((kind) => !excluded.has(kind) && limits[kind]-- > 0), excluded: [...excluded] };
}
const delegated = /^(?:(?:请|那就|就|那|好[，, ]*|可以[，, ]*|我选|我想要|随便[，, ]*|你就|你帮我)\s*)*(?:随机(?:选择|挑(?:一个)?|选(?:一个)?|来(?:一个|一篇)?)?|随便(?:选|挑|写)?|你(?:就)?看着办|你(?:来)?决定|交给你(?:决定)?|你(?:来)?选|(?:使?用|按|沿用|采用)(?:你推荐的)?默认(?:值|设置|方案)?|都行|都可以|没偏好|没有偏好)(?:吧|就好|即可|就行|都行)?$/u;
const topics = ["地铁通勤耳机怎么挑", "小户型租房收纳", "上班族一周轻便午餐", "周末半日城市散步", "学生党桌面整理"] as const;

const normalize = (value: string) => value.trim().replace(/[。！!？?～~；;]+$/u, "").trim();

export function isMediaOnlyRequest(value: string) {
  const text = normalize(value);
  return /^(?:(?:请你?|帮我|麻烦你?|给我)\s*)?(?:生成|制作|设计|做|绘制|画|配)(?:一下|(?:\d+|[一二两三四五六七八九十])(?:张|段|个|条))?(?:封面(?:图|图片)?|配图|图片|插图|视频|短片|图)$/u.test(text);
}

export function isPlaceholder(value: string) {
  return /^(?:自然回复或一个简短追问|自然回复|真实的\s*message|回复|追问)$/iu.test(normalize(value.replace(/^[「『“"'\x60]+|[」』”"'\x60]+$/gu, "")));
}

export function isWritingRequest(message: string) {
  if (consultations.test(message)) return false;
  const clauses = message.split(/[，。；！？\n,;!?]/u);
  return clauses.some((clause) => writingOutput.test(clause) && (writingVerb.test(clause.trim().replace(requestPrefix, "")) ||
    /(?:写|撰写|起草|生成)一[篇份则]/u.test(clause)) &&
    !/(?:笔记|小红书)(?:的)?封面(?:图|图片)?\s*$/u.test(clause) && !/^(?:改|修改|编辑|调整|润色|优化|压缩|缩短)/u.test(clause.trim())) ||
    (writingOutput.test(message) && coverOutput.test(message) && /(?:都要|同时|分别|一起|还要|也要|和|加上)/u.test(message) &&
      /(?:帮我|请|想要|需要|给我|写|起草|生成|创作|做|制作)/u.test(message) && /文案|正文|笔记和封面/u.test(message));
}

function topicFrom(request: string) {
  const named = (/(?:主题|产品)[是为：:]\s*([^，。；！？\n]{1,200})/u.exec(request)?.[1]
    ?? /以([^，。；！？\n]{1,200}?)为(?:主题|题)/u.exec(request)?.[1])?.trim();
  if (named) return named;
  const relevant = request.split(/[，。；！？\n,;!?]/u).find((part) => writingOutput.test(part) && writingAction.test(part)) ?? request;
  return relevant
    .replace(requestPrefix, "")
    .replace(/^(?:写|撰写|起草|起稿|生成|创作|出|做)(?:一?[篇条份个则]|一?下)?\s*/u, "")
    .replace(/^(?:一[篇条份个则]|(?:关于|围绕|以)|小红书|适合发在小红书的)\s*/gu, "")
    .replace(/(?:的)?(?:小红书)?(?:广告|推广|种草|图文)?(?:笔记|文案|广告稿|种草文).*$/u, "")
    .replace(/(?:的)?封面(?:图|图片)?(?:和|与|及|、)?$/u, "")
    .replace(/^(?:的|关于|围绕|以|小红书|一?[篇条份个则]|广告|推广|种草|图文|完整|原创|新|一)\s*/gu, "")
    .trim().slice(0, 200);
}

function randomTopic(requestId: string) {
  return topics[Number.parseInt(requestId.slice(0, 8), 16) % topics.length] ?? topics[0];
}

function fromRequest(request: string, draft: DraftData): CreativeTask {
  const topic = topicFrom(request) || draft.settings.topic.trim();
  const { required, excluded } = mediaRequirements(request);
  return { request, topic, cover: required.includes("cover") || (coverOutput.test(request) && !excludedCover.test(request) && !excluded.includes("cover")),
    media: required, excludedMedia: excluded, phase: topic ? "produce" : "clarify" };
}

type PriorTurn = { prompt: string | null; input: unknown; result: unknown; status: string };

export function resolveCreativeTask(raw: string, draft: DraftData, recent: PriorTurn[], requestId: string, submittedMedia: ReadonlySet<string>): CreativeTask | undefined {
  const text = normalize(raw);
  if (!text || consultations.test(text) || otherTurn.test(text)) return;
  const choose = delegated.test(text) || acceptedDefaults.test(text);
  const requested = isWritingRequest(text);
  const lastCancellation = recent.findIndex((turn) => /^(?:这篇不用了|取消这篇|不用了|取消|换个话题)$/u.test(normalize(turn.prompt ?? "")));
  const eligible = lastCancellation < 0 ? recent : recent.slice(0, lastCancellation);
  const previous = eligible.flatMap((turn) => {
    if (!turn.prompt) return [];
    const input = turn.input as { creativeTask?: unknown } | null;
    const task = creativeTaskSchema.safeParse(input?.creativeTask).data;
    if (task && (turn.status === "succeeded" || turn.status === "failed")) {
      const result = turn.result as { patch?: unknown; plan?: unknown; clarification?: true; cover?: { id: string }; media?: { id: string; source: string }[] } | null;
      return [{ task, pending: turn.status === "failed" || result?.clarification === true || (!result?.patch && !result?.plan),
        awaitingMedia: Boolean((result?.cover && !submittedMedia.has(result.cover.id)) ||
          result?.media?.some(({ id, source }) => source === "requested" && !submittedMedia.has(id))) }];
    }
    if (turn.status === "succeeded" && isWritingRequest(turn.prompt)) {
      const result = turn.result as { patch?: unknown; plan?: unknown } | null;
      return [{ task: fromRequest(turn.prompt, draft), pending: !result?.patch && !result?.plan, awaitingMedia: false }];
    }
    return [];
  })[0];
  if (choose && (previous || !acceptedDefaults.test(text))) {
    const task = previous?.pending || previous?.awaitingMedia ? previous.task : undefined;
    return task ? { ...task, topic: task.topic || randomTopic(requestId), phase: "produce", delegated: true }
      : { request: "自由选择一个常见的小红书题材并写一篇完整笔记", topic: randomTopic(requestId), cover: false, phase: "produce", delegated: true };
  }
  if (requested) {
    const task = fromRequest(text, draft);
    return !task.topic && previous?.pending ? { ...previous.task, cover: previous.task.cover || task.cover,
      media: task.media?.length ? task.media : previous.task.media,
      excludedMedia: [...new Set([...(previous.task.excludedMedia ?? []), ...(task.excludedMedia ?? [])])],
      topic: previous.task.topic || randomTopic(requestId), phase: "produce", delegated: true } : task;
  }
  if (!previous?.pending || text.length > 2000 || /(?:为何|什么|多少|怎么样|如何|是不是|是谁|吗|么)(?:的)?[？?]?$/u.test(raw.trim())) return;
  if (/^(?:(?:帮我|请你?|麻烦你?)\s*)?(?:生成|制作|画|设计|配)(?:一[张条段个]|一下)?(?:封面|图片|配图|视频)/u.test(text) ||
    /^(?:把|将)?(?:标题|开篇|正文|标签|结尾).*(?:改|换|删|加|压|缩|调整|优化)/u.test(text)) return;
  const requirements = mediaRequirements(text);
  return { ...previous.task, phase: "produce",
    ...(requirements.required.length ? { media: requirements.required } : {}),
    excludedMedia: [...new Set([...(previous.task.excludedMedia ?? []), ...requirements.excluded])],
    topic: previous.task.topic || (styleOnly.test(text) ? randomTopic(requestId) : text.slice(0, 200)), answer: text };
}
