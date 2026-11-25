import { z } from "zod";
import { settingsSchema, tryApplyEdits, type DraftData } from "../domain.js";

const kindSchema = z.enum(["generate", "revise", "analyze", "chat"]);
const fieldSchema = z.enum(["title", "body", "tags"]);
const requirementsSchema = z.object({
  titleMax: z.number().int().min(1).max(20).optional(),
  bodyMin: z.number().int().min(1).max(12000).optional(),
  bodyMax: z.number().int().min(1).max(12000).optional(),
  tagCount: z.number().int().min(0).max(10).optional(),
  fields: z.array(fieldSchema).optional(),
  localEdit: z.boolean().optional(),
  paragraph: z.union([z.number().int().positive(), z.literal("last")]).optional(),
});

export const piTurnContextSchema = z.object({
  userText: z.string().max(20000),
  kind: kindSchema,
  note: z.object({
    title: z.string(), body: z.string(), tags: z.array(z.string()), revision: z.number().int().nonnegative(),
    facts: z.string(), audience: z.string(), mode: z.enum(["original", "rewrite"]), topic: z.string(),
    referenceTitle: z.string().nullable(),
  }),
  requirements: requirementsSchema.optional(),
  requestId: z.uuid().optional(),
  sessionId: z.string().optional(),
});

export type PiTurnContext = z.infer<typeof piTurnContextSchema>;
type Requirements = z.infer<typeof requirementsSchema>;
type NoteFields = Pick<PiTurnContext["note"], "title" | "body" | "tags">;
type Edit = { find: string; replace: string };

export const piTurnRecordSchema = z.object({
  fingerprint: z.string(), revision: z.number().int().nonnegative(), kind: kindSchema,
  requirements: requirementsSchema.optional(),
  referenceVersions: z.array(z.object({ fileId: z.uuid(), versionId: z.uuid() })).optional(),
});

export function readTurnRecord(value: string) {
  try {
    return piTurnRecordSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export function noteForTurn(data: DraftData, revision: number): PiTurnContext["note"] {
  const { title, body, tags, settings } = data;
  return { title, body, tags, revision, facts: settings.facts, audience: settings.audience,
    mode: settings.mode, topic: settings.topic, referenceTitle: settings.referenceTitle || null };
}

const analysisSettings = settingsSchema.pick({ reference: true, source: true, referenceId: true, referenceTitle: true, referenceTags: true });
const analysisInput = z.object({ draft: z.object({ settings: analysisSettings }) });

export function referenceIdentity(settings: z.infer<typeof analysisSettings>) {
  return JSON.stringify([settings.source, settings.referenceId, settings.referenceTitle, settings.referenceTags]);
}

export function referenceFromAnalysis(input: unknown) {
  const parsed = analysisInput.safeParse(input).data?.draft.settings;
  return parsed ? { reference: parsed.reference, referenceIdentity: referenceIdentity(parsed) } : null;
}

const paragraphNumbers: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export function turnForPrompt(text: string, entryKind: PiTurnContext["kind"], note: PiTurnContext["note"]): PiTurnContext {
  const local = text.trim().match(/^(?:请\s*)?(?:帮我\s*)?(?:只|仅)(?:需要|想)?(?:修改|改写|改动|调整|优化|润色|重写|替换|改)\s*(?:正文的?)?\s*(标题|标签|开头|开篇|结尾|末段|第\s*([\d一二两三四五六七八九十]+)\s*段)/u);
  const create = /^(?:请\s*)?(?:帮我\s*|给我\s*)?(?:写|起草|生成|重写|重新生成)(?:一[篇条份]|一?版|完整的|这篇)[^。！？\n]{0,24}(?:笔记|文案)/u.test(text.trim());
  const kind = entryKind !== "chat" ? entryKind : local ? "revise" : create ? "generate" : "chat";
  const requirements: Requirements = {};
  if (kind === "revise" && local) {
    if (local[1] === "标题" || local[1] === "标签") {
      requirements.fields = [local[1] === "标题" ? "title" : "tags"];
    } else {
      requirements.fields = ["body"];
      requirements.localEdit = true;
      if (local[2]) requirements.paragraph = (paragraphNumbers[local[2]] ?? Number(local[2])) || undefined;
      else requirements.paragraph = local[1] === "结尾" || local[1] === "末段" ? "last" : 1;
    }
  }
  if (kind === "generate") {
    const tags = text.match(/(\d{1,2})\s*个(?:话题)?标签/u);
    const tagCount = Number(tags?.[1]);
    if (tags && tagCount <= 10) requirements.tagCount = tagCount;
    const title = text.match(/(?:标题\s*(?:不超过|最多)|标题\s*[:：]?\s*|)(\d{1,2})\s*字以内(?:的标题)?/u);
    const titleMax = Number(title?.[1]);
    if (titleMax >= 1 && titleMax <= 20 && title && /标题/u.test(title[0])) requirements.titleMax = titleMax;
    const body = text.match(/(?:正文\s*[：:]?\s*)?(\d{2,5})\s*[–—~～至到-]\s*(\d{2,5})\s*字(?:\s*正文)?/u);
    if (body && /正文/u.test(body[0]) && Number(body[1]) > 0 && Number(body[1]) <= Number(body[2]) && Number(body[2]) <= 12000) {
      requirements.bodyMin = Number(body[1]);
      requirements.bodyMax = Number(body[2]);
    }
  }
  return { userText: text, kind, note, ...(Object.keys(requirements).length ? { requirements } : {}) };
}

export function validateCandidate(input: {
  patch: Partial<NoteFields>; before?: Partial<NoteFields>; edits?: Edit[];
  kind: PiTurnContext["kind"]; requirements?: Requirements;
}): string | null {
  const { patch, before, edits, kind, requirements } = input;
  const fields = Object.keys(patch) as (keyof NoteFields)[];
  if (!fields.length) return "候选稿至少需要一项修改。";
  if (patch.title !== undefined && !patch.title.trim()) return "候选标题为空，请补齐后提交。";
  if (patch.body !== undefined && !patch.body.trim()) return "候选正文为空，请补齐后提交。";
  if (patch.tags) {
    const normalized = patch.tags.map((tag) => tag.trim().replace(/^#+\s*/u, ""));
    if (normalized.some((tag) => !tag) || new Set(normalized.map((tag) => tag.toLowerCase())).size !== normalized.length) {
      return "候选标签需要非空且互不重复。";
    }
    patch.tags = normalized;
  }
  if (kind === "generate" && (!patch.title || !patch.body || !patch.tags)) return "完整起稿请一次提交标题、正文和标签。";
  if (!requirements) return null;
  if (requirements.fields && fields.some((field) => !requirements.fields?.includes(field))) return "候选包含本轮指定范围之外的字段。";
  if (requirements.localEdit) {
    if (before?.body === undefined || !edits?.length || tryApplyEdits(before.body, edits) !== patch.body) {
      return "局部改稿请用唯一的原文锚点逐项提交替换，保留其他正文。";
    }
    if (requirements.paragraph !== undefined) {
      const parts = before.body.split(/\r?\n[\t ]*\r?\n/u).filter((part) => part.trim());
      const paragraphs = parts.length > 1 ? parts : before.body.split(/\r?\n/u).filter((part) => part.trim());
      const selected = paragraphs.at(requirements.paragraph === "last" ? -1 : requirements.paragraph - 1);
      if (!selected || edits.some(({ find }) => !selected.includes(find))) return "替换位置超出本轮指定的段落。";
    }
  }
  if (patch.title && requirements.titleMax && Array.from(patch.title).length > requirements.titleMax) return `标题须在 ${requirements.titleMax} 字以内。`;
  if (patch.body && (requirements.bodyMin || requirements.bodyMax)) {
    const length = Array.from(patch.body.replace(/\s/gu, "")).length;
    if (length < (requirements.bodyMin ?? 0) || length > (requirements.bodyMax ?? Infinity)) {
      return `正文目前 ${length} 字，请调整到 ${requirements.bodyMin}–${requirements.bodyMax} 字。`;
    }
  }
  if (requirements.tagCount !== undefined && patch.tags?.length !== requirements.tagCount) return `请提交 ${requirements.tagCount} 个标签。`;
  return null;
}
