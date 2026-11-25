import { z } from "zod";

export const textLength = (value: string) => Array.from(value).length;
const title = z.string().refine((value) => textLength(value) <= 20, "标题最多 20 字");
const tags = z.array(z.string().trim().min(1).max(30)).max(10);

export const referenceImageSchema = z.object({
  url: z.string().min(1).max(1500),
  sig: z.string().min(16).max(128),
  role: z.enum(["media", "cover"]),
});

export const referenceMetaSchema = z.object({
  platform: z.literal("xiaohongshu"),
  noteId: z.string().max(64),
  url: z.string().max(1000),
  noteType: z.enum(["image", "video"]),
  author: z.string().max(100).default(""),
  publishedAt: z.string().max(64).default(""),
  likes: z.number().int().nonnegative().nullable().default(null),
  favorites: z.number().int().nonnegative().nullable().default(null),
  comments: z.number().int().nonnegative().nullable().default(null),
  shares: z.number().int().nonnegative().nullable().default(null),
  images: z.array(referenceImageSchema).max(20).default([]),
});

export const settingsSchema = z.object({
  mode: z.enum(["original", "rewrite"]),
  topic: z.string().max(200),
  category: z.string().max(80),
  facts: z.string().max(8000),
  audience: z.string().max(100),
  tone: z.string().max(60),
  length: z.enum(["short", "standard", "long"]),
  titleStyle: z.string().max(60),
  tagCount: z.number().int().min(3).max(10),
  emoji: z.boolean(),
  instructions: z.string().max(2000),
  reference: z.string().max(8000),
  angle: z.string().max(100),
  intensity: z.number().int().min(20).max(100),
  referenceTitle: z.string().max(200).default(""),
  referenceId: z.string().max(200).nullable().default(null),
  referenceTags: z.array(z.string().max(30)).max(10).default([]),
  referenceMeta: referenceMetaSchema.nullable().default(null),
  source: z.enum(["tracked", "paste", "keyword"]).default("paste"),
  keepHook: z.boolean().default(true),
  keepParagraphs: z.boolean().default(true),
  keepTags: z.boolean().default(false),
});

export const fieldsSchema = z.object({ title, body: z.string().max(12000), tags });
export const draftSchema = fieldsSchema.extend({
  coverId: z.uuid().nullable(),
  videoId: z.uuid().nullable().default(null),
  imageIds: z.array(z.uuid()).max(9).refine((ids) => new Set(ids).size === ids.length).default([]),
  publishKind: z.enum(["image", "video"]).nullable().default(null),
  example: z.boolean().default(false),
  settings: settingsSchema,
});
export const emptyDraft: DraftData = {
  title: "", body: "", tags: [], coverId: null, videoId: null, imageIds: [], publishKind: null, example: false,
  settings: {
    mode: "original", topic: "", category: "", facts: "", audience: "", tone: "真诚分享",
    length: "standard", titleStyle: "数字清单", tagCount: 6, emoji: true,
    instructions: "", reference: "", angle: "换人群", intensity: 60,
    referenceTitle: "", referenceId: null, referenceTags: [], referenceMeta: null, source: "paste",
    keepHook: true, keepParagraphs: true, keepTags: false,
  },
};
export const exampleDraft: DraftData = {
  ...emptyDraft, example: true,
  title: "早八人请进｜这只通勤包真的能装",
  body: "✨ 先说结论：轻量通勤托特包是我最近使用频率最高的一只包。\n\n👜 ① 容量比看上去更能装\n13 寸电脑、折叠伞、水杯和化妆包都能放下，内袋分区也很清楚。\n\n🪶 ② 自重控制得不错\n装满之后肩带压力可以接受，通勤 40 分钟没有明显勒肩。\n\n🔍 ③ 细节决定使用频率\n拉链顺滑、底部有支撑，放在地铁座位上不会软塌。\n\n以上是原型示例内容，请按自己的情况修改。",
  tags: ["通勤穿搭", "包包分享", "打工人日常", "通勤好物", "一包多背", "轻量出行"],
  settings: { ...emptyDraft.settings, topic: "轻量通勤托特包", category: "通勤箱包",
    facts: "能装下 13 寸电脑\n自重轻，肩带不勒\n内袋分区清楚", audience: "早八打工人" },
};

export const attachmentInfo = z.object({ id: z.uuid(), name: z.string(), mime: z.string(), size: z.number().int() });
export const attachmentIds = z.array(z.uuid()).max(3).refine((ids) => new Set(ids).size === ids.length);
export const planAction = z.object({
  kind: z.enum(["write", "artifact", "cover", "image", "video"]), instruction: z.string().trim().min(1).max(1200),
  targetId: z.uuid().optional(),
});
export const workspaceRef = z.object({ fileId: z.uuid(), versionId: z.uuid(), version: z.number().int(), name: z.string(), mime: z.string() });
export const artifactOutput = z.object({ name: z.string().trim().min(1).max(160), markdown: z.string().trim().min(1).max(12000) });
export const planSteps = z.array(planAction).min(1).max(12);
export const mediaDeliverable = z.enum(["cover", "image", "video"]);
export const mediaProposal = z.object({
  id: z.uuid(),
  kind: mediaDeliverable,
  source: z.enum(["requested", "suggested"]),
  prompt: z.string().trim().min(1).max(3000),
});
export const plannedMedia = z.array(planAction.extend({ id: z.uuid(), kind: z.enum(["cover", "image", "video"]) }));
export const creativeTaskSchema = z.object({
  request: z.string().max(2000),
  topic: z.string().max(200),
  cover: z.boolean(),
  media: z.array(mediaDeliverable).max(11).optional(),
  excludedMedia: z.array(mediaDeliverable).optional(),
  phase: z.enum(["clarify", "produce"]),
  answer: z.string().max(2000).optional(),
  delegated: z.boolean().optional(),
});
export type CreativeTask = z.infer<typeof creativeTaskSchema>;
export const submissionSchema = z.object({
  revision: z.number().int().nonnegative(),
  kind: z.enum(["generate", "analyze", "revise", "plan"]),
  prompt: z.string().trim().max(2000).optional(),
  requestId: z.uuid(),
  attachments: attachmentIds.default([]),
  workspace: z.array(z.uuid()).max(3).default([]),
  artifactTarget: z.uuid().optional(),
  retryOf: z.uuid().optional(),
});
export const resultSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  analysis: z.array(z.object({ label: z.string().max(40), detail: z.string().max(400) })).min(1).max(8).optional(),
  referenceImport: z.object({
    images: z.number().int().nonnegative(),
    failedImages: z.number().int().nonnegative().default(0),
    markdownPath: z.string().max(260),
    piSynced: z.boolean(),
  }).optional(),
  patch: fieldsSchema.partial().optional(),
  before: fieldsSchema.partial().optional(),
  appliedPatch: fieldsSchema.partial().optional(),
  appliedBefore: fieldsSchema.partial().optional(),
  edits: z.array(z.object({ find: z.string().max(2000), replace: z.string().max(2000) })).max(8).optional(),
  plan: planSteps.optional(),
  changed: z.array(z.enum(["title", "body", "tags"])).optional(),
  clarification: z.literal(true).optional(),
  cover: z.object({ id: z.uuid(), prompt: z.string().trim().min(1).max(3000) }).optional(),
  media: z.array(mediaProposal).max(11).optional(),
  superseded: z.literal(true).optional(),
  contextNotice: z.enum(["summarized", "trimmed"]).optional(),
  sources: z.array(workspaceRef).optional(),
  workspaceDependencies: z.array(workspaceRef).optional(),
  artifacts: z.array(artifactOutput).max(3).optional(),
  publishedArtifacts: z.array(workspaceRef).optional(),
  artifactConflict: z.literal(true).optional(),
  artifactError: z.string().optional(),
  unreadImages: z.literal(true).optional(),
  toolChecks: z.object({ errors: z.array(z.string()), warnings: z.array(z.string()), verify: z.array(z.string()) }).optional(),
  sourceConflict: z.literal(true).optional(),
});
export const jobInputSchema = z.object({
  draft: draftSchema,
  analysis: resultSchema.shape.analysis,
  history: z.array(z.object({ request: z.string(), response: z.string() })),
  attachments: z.array(attachmentInfo).default([]),
  planExecution: z.boolean().optional(),
  creativeTask: creativeTaskSchema.optional(),
  mediaOnly: z.literal(true).optional(),
  workspaceSources: z.array(workspaceRef).optional(),
  workspaceRequired: z.array(z.uuid()).optional(),
  unreadImages: z.literal(true).optional(),
  artifactWrite: z.enum(["create", "update"]).optional(),
  artifactTargets: z.array(workspaceRef.nullable()).optional(),
  artifactCount: z.number().int().min(1).max(3).optional(),
  planWritesNote: z.boolean().optional(),
});

export type DraftData = z.infer<typeof draftSchema>;
export type RunInput = z.infer<typeof jobInputSchema>;
export type Result = z.infer<typeof resultSchema>;
export type Kind = z.infer<typeof submissionSchema>["kind"];
export function changedFields(before: Pick<DraftData, "title" | "body" | "tags">, after: Pick<DraftData, "title" | "body" | "tags">) {
  return (["title", "body", "tags"] as const).filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

export function tryApplyEdits(body: string, edits: { find: string; replace: string }[]): string | null {
  let next = body;
  for (const edit of edits) {
    if (!edit.find) return null;
    const first = next.indexOf(edit.find);
    if (first === -1 || next.indexOf(edit.find, first + 1) !== -1) return null;
    next = next.slice(0, first) + edit.replace + next.slice(first + edit.find.length);
  }
  return next;
}

export function resolvePiStagePatch(
  current: Pick<DraftData, "title" | "body" | "tags">, result: Result, stale: boolean,
): Result["patch"] | null {
  const { patch, before, edits } = result;
  if (!patch || !Object.keys(patch).length) return undefined;
  for (const field of ["title", "tags"] as const) {
    if (patch[field] === undefined) continue;
    const currentValue = JSON.stringify(current[field]);
    if (JSON.stringify(patch[field]) === currentValue) continue;
    if ((stale || before?.[field] !== undefined) && JSON.stringify(before?.[field]) !== currentValue) return null;
  }
  if (!edits?.length) {
    if (patch.body !== undefined && (stale || (before?.body !== undefined && before.body !== current.body))) return null;
    return patch;
  }
  if (patch.body === undefined || (stale && before?.body === undefined)) return null;
  if (before?.body !== undefined && tryApplyEdits(before.body, edits) !== patch.body) return null;
  const body = tryApplyEdits(current.body, edits);
  return body === null ? null : { ...patch, body };
}
export const mediaKind = z.enum(["cover", "image", "textToVideo", "imageToVideo"]);
export const capability = z.enum(["text", "cover", "textToVideo", "imageToVideo", "vision"]);
export type MediaKind = z.infer<typeof mediaKind>;
export type Capability = z.infer<typeof capability>;
export const mediaOptions = z.object({
  ratio: z.enum(["3:4", "9:16", "1:1", "16:9"]).optional(),
  duration: z.union([z.literal(5), z.literal(10)]).optional(),
  sourceCoverId: z.uuid().optional(),
});
export const mediaInput = mediaOptions.extend({ prompt: z.string().trim().min(1).max(3000) });
export const profileForMedia = (kind: MediaKind): Capability => kind === "image" ? "cover" : kind;

export function checks(data: DraftData) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.title.trim()) errors.push("请填写标题");
  if (!data.body.trim()) errors.push("请填写正文");
  const matches = [...new Set(`${data.title}\n${data.body}`.match(/全网第一|绝对有效|百分百有效|最佳|最强|保证见效/g) ?? [])];
  if (matches.length) warnings.push(`请核对这些表述：${matches.join("、")}`);
  return { errors, warnings, hasCover: Boolean(data.coverId), hasVideo: Boolean(data.videoId), imageCount: data.imageIds.length };
}
