import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import multipart from "@fastify/multipart";
import { Prisma, type CreationPlan, type Draft, type Finalization, type MediaBrief, type Run } from "@prisma/client";
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { db, env } from "./config.js";
import { attachmentInfo, capability, changedFields, checks, draftSchema, emptyDraft, exampleDraft, jobInputSchema, mediaInput, mediaKind, plannedMedia, profileForMedia, resolvePiStagePatch, resultSchema, submissionSchema, type MediaKind } from "./domain.js";
import { briefKind, briefLabels, briefSchema, briefView, mediaIntent, mediaMessages, mediaNoteFingerprint, noteContext } from "./media-brief.js";
import { activeMediaPreparation, briefIdentity, mediaPreparationKind, preparationInput, preparing, sameBrief } from "./media-preparation.js";
import { deleteMedia, imageType, mediaBytes, readMedia, storeMedia } from "./media.js";
import { artifactTarget, currentDependencies, fileRef, rankSources, requestedArtifact, workspaceFiles } from "./workspace.js";
import { capabilities, credentials, hasMasterKey, isAdmin, latest, modelInput, presets, profileView, saveProfile, status } from "./model-settings.js";
import { downloadResult, testBailian } from "./bailian.js";
import { piText, testPiTools } from "./model.js";
import { ContextLimitError, ModelOutputError } from "./model.js";
import { toolProgressSchema } from "./star-tools.js";
import { isMediaOnlyRequest, isPlaceholder, isWritingRequest, resolveCreativeTask } from "./creative-task.js";
import { findReferences, readAsset, readReference, sourceAvailability, SourceError } from "./sources.js";
import { awaitingWriteback, failRun, isPiCandidate, mediaOnly } from "./writeback.js";
import { logGeneration, withGenerationLog } from "./generation-log.js";
import { closeGenerationProbe, generationReadiness, generationServices } from "./generation-health.js";
import { registerPiGateway, RunnerError, syncFileToPiWorkspace } from "./pi-gateway.js";
import { referenceFromAnalysis, referenceIdentity } from "./pi/turn.js";
import { webSourceSchema } from "./web-search.js";
import { checkCollectorHealth, fetchXhsMediaImage, parseXhsNote, XhsError } from "./xhs.js";
import { executeAnalyzeRun, safeXhsNoteId, upsertDraftWorkspaceFile } from "./reference-import.js";
import { applyBriefDefaultsToDraft, loadUserPreferences, resetPreferencesSection, saveUserPreferences, userPreferencesSchema } from "./preferences.js";

class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
const missing = () => new ApiError(404, "NOT_FOUND", "没有找到该内容");
const conflict = () => new ApiError(409, "REVISION_CONFLICT", "草稿已更新，请先处理版本冲突");
const requestIdConflict = () => new ApiError(409, "REQUEST_ID_CONFLICT", "请求编号已用于不同内容，请重新提交");
const preparationBusy = () => new ApiError(409, "MEDIA_PREPARATION_IN_PROGRESS", "已有媒体方案正在整理，请先取消或等待完成");
const staleMediaBrief = () => new ApiError(409, "MEDIA_BRIEF_STALE", "标题或正文已变化，请按最新稿重新整理方案");
const invalid = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);
const idSchema = z.object({ id: z.uuid() });
const revisionSchema = z.object({ revision: z.number().int().nonnegative() });
const pathId = (req: FastifyRequest) => idSchema.parse(req.params).id;
const noteName = z.string().trim().min(1, "请填写笔记名").refine((name) => Array.from(name).length <= 40, "笔记名最多 40 字");
const emptyWorkingData = JSON.stringify(emptyDraft);
function draftView(draft: Draft) {
  const data = draftSchema.parse(draft.data);
  const hasUnsavedChanges = draft.savedData
    ? draft.name !== draft.savedName || JSON.stringify(data) !== JSON.stringify(draftSchema.parse(draft.savedData))
    : Boolean(draft.name || JSON.stringify(data) !== emptyWorkingData);
  return { id: draft.id, revision: draft.revision, name: draft.name, data, updatedAt: draft.updatedAt,
    savedAt: draft.savedAt, hasUnsavedChanges };
}
const mediaHistory = z.object({ messages: mediaMessages });
const candidateSources = z.object({ sources: z.array(webSourceSchema) });
const conversationInput = jobInputSchema.pick({ attachments: true, planExecution: true }).extend({
  explicitWorkspace: z.array(z.uuid()).optional(), chosenArtifact: z.uuid().optional(),
}).partial();
const planView = (plan: CreationPlan | null) => plan ? { ...plan, media: plannedMedia.parse(plan.media) } : null;
function visibleResult(result: Run["result"]) {
  const parsed = z.object({ message: z.string() }).passthrough().safeParse(result).data;
  if (!parsed) return { result };
  const { workspaceDependencies: _workspaceDependencies, message, ...rest } = parsed;
  if (!isPlaceholder(message)) return { result: { message, ...rest } };
  return { result: Object.keys(rest).length ? rest : null, hiddenReply: true };
}
const runView = (run: Run, restoredRevision = 0) => ({
  id: run.id, baseRevision: run.baseRevision, kind: run.kind, status: run.status,
  prompt: run.prompt, ...visibleResult(run.result), error: run.error, createdAt: run.createdAt, updatedAt: run.updatedAt,
  appliedRevision: run.appliedRevision, undone: Boolean(run.undoneAt),
  failureDetail: run.failureDetail,
  toolProgress: toolProgressSchema.safeParse(run.toolProgress).data ?? [],
  archived: run.baseRevision < restoredRevision,
  ...conversationInput.safeParse(run.input).data,
  ...(run.kind === mediaPreparationKind ? { preparationKind: preparationInput.pick({ kind: true }).parse(run.input).kind } : {}),
  ...(mediaKind.safeParse(run.kind).success ? { mediaMessages: mediaHistory.safeParse(run.input).data?.messages } : {}),
  ...(run.kind === "analyze" ? referenceFromAnalysis(run.input) : {}),
  ...(candidateSources.safeParse(run.input).success ? { webSources: candidateSources.parse(run.input).sources } : {}),
});
const finalView = (final: Finalization) => ({
  finalizationId: final.id, draftId: final.draftId, ownerId: final.ownerId,
  revision: final.revision, title: final.title, body: final.body, tags: final.tags,
  coverId: final.coverId, videoId: final.videoId, imageIds: final.imageIds, noteKind: final.videoId ? "video" : "image", finalizedAt: final.finalizedAt,
});
const briefVersion = z.object({ briefId: z.uuid(), version: z.number().int().positive() });

const sessionCookie = (req: FastifyRequest) => req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("zx_session="));
async function owner(req: FastifyRequest) {
  const session = sessionCookie(req);
  if (!session) throw new ApiError(401, "UNAUTHORIZED", "请先登录");
  let response: Response;
  try {
    response = await fetch(env.accountUrl, {
      headers: { cookie: session }, redirect: "error", signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new ApiError(503, "ACCOUNT_UNAVAILABLE", "暂时无法验证登录，请稍后重试");
  }
  if (response.status === 401 || response.status === 403) throw new ApiError(401, "UNAUTHORIZED", "登录已失效");
  const identity = z.object({ user: z.object({ id: z.string().min(1) }) }).safeParse(
    response.ok ? await response.json().catch(() => null) : null,
  );
  if (!identity.success) throw new ApiError(503, "ACCOUNT_UNAVAILABLE", "暂时无法验证登录，请稍后重试");
  return identity.data.user.id;
}

async function admin(req: FastifyRequest) {
  const id = await owner(req);
  if (!isAdmin(id)) throw new ApiError(403, "FORBIDDEN", "模型配置仅管理员可访问");
  return id;
}

function publisher(req: FastifyRequest) {
  const expected = Buffer.from(`Bearer ${env.publishToken}`);
  const provided = Buffer.from(req.headers.authorization ?? "");
  if (!env.publishToken || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ApiError(401, "UNAUTHORIZED", "需要发布管理服务凭据");
  }
}

async function ownedDraft(req: FastifyRequest) {
  const draft = await db.draft.findFirst({ where: { id: pathId(req), ownerId: await owner(req), deletedAt: null } });
  if (!draft) throw missing();
  return draft;
}

async function lockWorkingDraft(tx: Prisma.TransactionClient, draft: Draft) {
  await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draft.id}::uuid FOR UPDATE`;
  const current = await tx.draft.findUnique({ where: { id: draft.id, deletedAt: null }, select: { revision: true, restoredRevision: true } });
  if (!current || current.revision !== draft.revision) throw conflict();
  return current;
}

async function lockWorkspace(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${id}::uuid FOR UPDATE`;
  if (!await tx.draft.findUnique({ where: { id, deletedAt: null }, select: { id: true } })) throw missing();
}

type SubmissionIdentity = {
  kind: string;
  revision: number;
  prompt?: string;
  attachments?: string[];
  retryOf?: string;
  workspace?: string[];
  artifactTarget?: string;
};

function requestFingerprint(source: "runs" | "media-runs", draftId: string, input: SubmissionIdentity) {
  return createHash("sha256").update(JSON.stringify([
    source, draftId, input.kind, input.revision, input.prompt || null, input.attachments ?? [], input.retryOf ?? null,
    ...((input.workspace?.length || input.artifactTarget) ? [input.workspace ?? [], input.artifactTarget ?? null] : []),
  ])).digest("hex");
}

function replayRun(run: Run, draft: Draft, fingerprint: string, source: "runs" | "media-runs", input: SubmissionIdentity) {
  if (run.draftId !== draft.id || run.kind !== input.kind) throw requestIdConflict();
  if (run.requestFingerprint) {
    if (run.requestFingerprint !== fingerprint) throw requestIdConflict();
    return run;
  }
  if (input.workspace?.length || input.artifactTarget) throw requestIdConflict();
  const prior = run.input as { planExecution?: boolean; messages?: unknown; attachments?: { id: string }[] } | null;
  const attachments = input.attachments ?? [];
  const fallbackPrompt = attachments.length ? "请参考当前附件" : null;
  if (run.baseRevision !== input.revision || input.retryOf || prior?.planExecution || prior?.messages ||
    (source === "runs" && (run.prompt !== (input.prompt || fallbackPrompt) ||
      JSON.stringify(prior?.attachments?.map(({ id }) => id) ?? []) !== JSON.stringify(attachments))) ||
    (source === "media-runs" && run.prompt !== null)) throw requestIdConflict();
  return run;
}

async function lockRequest(tx: Prisma.TransactionClient, requestId: string) {
  // The UUID is global, including across drafts and submission endpoints.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${requestId}::text, 0))`;
  return tx.run.findUnique({ where: { id: requestId } });
}

async function update(draft: Draft, revision: number, data: ReturnType<typeof draftSchema.parse>, name?: string | null) {
  const rows = await db.draft.updateManyAndReturn({
    where: { id: draft.id, ownerId: draft.ownerId, revision, deletedAt: null },
    data: { data, name, revision: { increment: 1 } },
  });
  if (!rows[0]) throw conflict();
  return draftView(rows[0]);
}

async function sendMedia(reply: FastifyReply, media: { objectKey: string; mime: string }, range?: string) {
  const item = await readMedia(media.objectKey, range);
  reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
  if (item.url) return reply.redirect(item.url);
  reply.header("Accept-Ranges", "bytes");
  if (item.invalid) return reply.code(416).header("Content-Range", `bytes */${item.size}`).send();
  if (item.range) reply.code(206).header("Content-Range", item.range);
  if (item.length !== undefined) reply.header("Content-Length", item.length);
  return reply.type(media.mime).send(item.stream);
}

const api = Fastify({ logger: true, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 128 * 1024 });
await api.register(multipart, { limits: { files: 1, parts: 1, fileSize: 5 * 1024 * 1024 } });
api.addHook("onRequest", async (req, reply) => {
  reply.header("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin && req.headers.origin !== env.appOrigin) {
    throw new ApiError(403, "ORIGIN_DENIED", "请求来源不受信任");
  }
});
api.setErrorHandler((error, req, reply) => {
  if (error instanceof SourceError) return reply.code(error.status).send({ code: "SOURCE_UNAVAILABLE", message: error.message });
  if (error instanceof XhsError) return reply.code(error.status).send({ code: error.code, message: error.message });
  if (error instanceof ApiError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  if (error instanceof RunnerError) return reply.code(error.status).send({ code: error.code, message: error.message });
  if (error instanceof z.ZodError) return reply.code(400).send({ code: "VALIDATION_ERROR", message: error.issues[0]?.message });
  if ((error as { statusCode?: number }).statusCode === 413) {
    return reply.code(413).send({ code: "FILE_TOO_LARGE", message: "文件或输入过大，图片最多 5 MB" });
  }
  if ((error as { statusCode?: number }).statusCode === 400) {
    return reply.code(400).send({ code: "VALIDATION_ERROR", message: "请求内容格式不正确" });
  }
  if (req.url.includes("/pi/") || req.url.startsWith("/internal/pi")) {
    req.log.error({ err: error }, "pi gateway error");
  }
  logGeneration("generation.api-error", { traceId: req.id, stage: "api", outcome: "failed", errorType: "unexpected" });
  return reply.code(503).send({ code: "SERVICE_UNAVAILABLE", message: "创作服务暂时不可用，请重试" });
});

api.get("/health", async () => {
  await db.$queryRaw`SELECT 1`;
  return { ok: true };
});
api.get("/health/live", async () => ({ ok: true }));
api.get("/health/ready", async (_req, reply) => {
  const readiness = await generationReadiness();
  return reply.code(readiness.ok ? 200 : 503).send(readiness);
});
api.addHook("onClose", closeGenerationProbe);

async function requireGenerationReady() {
  const { redis, worker } = await generationServices();
  if (!redis || !worker) {
    throw new ApiError(503, "GENERATION_UNAVAILABLE", "生成服务暂时不可用。你仍可以编辑和保存草稿，稍后可重试生成。");
  }
}
const prefix = "/v1/creation";
registerPiGateway(api, { owner });
api.get(`${prefix}/config`, async (req) => {
  const userId = await owner(req);
  const [modelStatus, xhsLink] = await Promise.all([status(userId), checkCollectorHealth()]);
  return { ...modelStatus, sources: { ...sourceAvailability(), xhsLink } };
});
api.get(`${prefix}/preferences`, async (req) => {
  const userId = await owner(req);
  return { preferences: await loadUserPreferences(userId) };
});
api.put(`${prefix}/preferences`, async (req) => {
  const userId = await owner(req);
  const body = userPreferencesSchema.parse(req.body);
  return { preferences: await saveUserPreferences(userId, body) };
});
api.post(`${prefix}/preferences/reset`, async (req) => {
  const userId = await owner(req);
  const { section } = z.object({ section: z.enum(["all", "brief", "chat", "canvas"]).default("all") }).parse(req.body ?? {});
  const current = await loadUserPreferences(userId);
  const next = resetPreferencesSection(current, section);
  return { preferences: await saveUserPreferences(userId, next) };
});
api.get(`${prefix}/admin/models`, async (req) => {
  await admin(req);
  const profiles = await Promise.all(capabilities.map(latest));
  return { profiles: profiles.flatMap((profile) => profile ? [profileView(profile)] : []), presets, writable: hasMasterKey() };
});
api.put(`${prefix}/admin/models/:kind`, async (req) => {
  const adminId = await admin(req);
  const kind = z.object({ kind: capability }).parse(req.params).kind;
  const input = modelInput.parse(req.body);
  try {
    return profileView(await saveProfile(kind, input, adminId));
  } catch (error) {
    const messages: Record<string, string> = {
      MODEL_ADDRESS_DENIED: "该接入地址不在服务端允许范围内。",
      MODEL_CREDENTIAL_REQUIRED: "请录入此服务地址对应的 API Key。",
      MODEL_KEY_UNCONFIGURED: "请先在部署环境配置模型加密主密钥。",
      MEDIA_PROVIDER_UNSUPPORTED: "图片和视频使用百炼接口。",
    };
    if (error instanceof Error && messages[error.message]) throw invalid(messages[error.message]);
    // Database errors can include arguments. Do not log model configuration inputs.
    throw new ApiError(503, "MODEL_CONFIG_ERROR", "暂时无法保存模型配置");
  }
});
api.post(`${prefix}/admin/models/:kind/test`, async (req) => {
  await admin(req);
  const kind = z.object({ kind: capability }).parse(req.params).kind;
  const profile = await latest(kind);
  if (!profile) throw invalid("请先保存模型配置");
  try {
    const settings = credentials(profile);
    if (kind === "text" || kind === "vision") {
      const images = kind === "vision" ? [{
        type: "image" as const, mimeType: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=",
      }] : [];
      await withGenerationLog({ traceId: req.id, profileId: profile.id, kind }, () =>
        piText(kind === "vision" ? "描述所附测试图片。" : "只回复 OK。", settings, images, "connection-test"));
      return { ok: true, note: kind === "vision" ? "Pi 已收到视觉模型的真实回复。" : "Pi 已收到文字模型的真实回复。" };
    }
    return await testBailian(settings);
  } catch {
    throw new ApiError(502, "MODEL_CONNECTION_ERROR", "连接失败。请检查接入地址、模型 ID、API Key 或空间权限。");
  }
});
api.post(`${prefix}/admin/models/:kind/test-tools`, async (req) => {
  const userId = await owner(req);
  if (!isAdmin(userId)) throw new ApiError(403, "ADMIN_REQUIRED", "需要模型管理员权限");
  const { kind } = z.object({ kind: z.enum(["text", "vision"]) }).parse(req.params);
  const profile = await latest(kind);
  if (!profile || !hasMasterKey()) throw invalid("请先保存模型配置");
  const images = kind === "vision" ? [{
    type: "image" as const, mimeType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=",
  }] : [];
  const toolsVerified = await withGenerationLog({ traceId: req.id, profileId: profile.id, kind }, () =>
    testPiTools(credentials(profile), images)).catch(() => false);
  await db.modelProfile.update({ where: { id: profile.id }, data: { toolsVerified } });
  return { ok: toolsVerified, note: toolsVerified ? "工具调用测试通过。" : "工具调用测试未通过，继续使用基础创作模式。" };
});
api.get(`${prefix}/sources/references`, async (req) => {
  await owner(req);
  const query = z.object({ keyword: z.string().max(200).optional(), cursor: z.string().max(200).optional() }).parse(req.query);
  return findReferences(query, sessionCookie(req)!);
});
api.get(`${prefix}/sources/references/:id`, async (req) => {
  await owner(req);
  const id = z.object({ id: z.string().min(1).max(200) }).parse(req.params).id;
  return readReference(id, sessionCookie(req)!);
});
api.post(`${prefix}/xhs/parse`, async (req) => {
  await owner(req);
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
  return parseXhsNote(text);
});
api.get(`${prefix}/xhs/media-proxy`, async (req, reply) => {
  await owner(req);
  const { url, sig } = z.object({
    url: z.string().min(1).max(1500),
    sig: z.string().min(16).max(128),
  }).parse(req.query);
  const { bytes, mime } = await fetchXhsMediaImage(url, sig, 10 * 1024 * 1024);
  return reply
    .header("Cache-Control", "private, max-age=300")
    .header("X-Content-Type-Options", "nosniff")
    .header("Content-Security-Policy", "default-src 'none'")
    .type(mime)
    .send(bytes);
});
api.post(`${prefix}/drafts/:id/xhs/import-image`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const body = z.object({
    url: z.string().min(1).max(1500),
    sig: z.string().min(16).max(128),
    noteId: z.string().max(64).optional(),
    index: z.number().int().min(0).max(50).optional(),
  }).parse(req.body);
  const { bytes } = await fetchXhsMediaImage(body.url, body.sig, 5 * 1024 * 1024);
  const mime = imageType(bytes);
  if (!mime) throw invalid("仅支持导入 JPG、PNG、WebP 格式图片到工作区");

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const safeNoteId = safeXhsNoteId(body.noteId ?? "note");
  const label = body.index !== undefined ? `图${body.index + 1}` : "参考图";
  const name = `xhs-${safeNoteId}-${label}.${ext}`;

  const saved = await upsertDraftWorkspaceFile(
    { id: draft.id, ownerId: draft.ownerId, revision: draft.revision },
    name,
    mime,
    bytes,
    `xhs-ref/${name}`,
  );
  return reply.code(saved.alreadyExists ? 200 : 201).send(saved);
});
api.post(`${prefix}/drafts/:id/import-asset`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { assetId } = z.object({ assetId: z.string().min(1).max(200) }).parse(req.body);
  const asset = await readAsset(assetId, sessionCookie(req)!);
  if (asset.type === "text") return { type: "text", text: asset.content.text };
  const { mime, bytes } = await downloadResult(asset.content.accessUrl, true);
  const id = randomUUID();
  await storeMedia(id, mime, bytes);
  try {
    await db.media.create({ data: { id, draftId: draft.id, mime, objectKey: id } });
  } catch (error) {
    await deleteMedia(id).catch(() => undefined);
    throw error;
  }
  return reply.code(201).send({ type: "image", coverId: id });
});
api.get(`${prefix}/drafts`, async (req) => {
  const ownerId = await owner(req);
  const { cursor, q } = z.object({ cursor: z.uuid().optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
  const term = q?.replace(/[\\%_]/g, "\\$&");
  const where: Prisma.DraftWhereInput = { ownerId, deletedAt: null, savedAt: { not: null },
    ...(term ? { OR: [{ savedName: { contains: term, mode: "insensitive" } }, { savedTitle: { contains: term, mode: "insensitive" } }] } : {}) };
  const anchor = cursor ? await db.draft.findFirst({ where: { ...where, id: cursor }, select: { id: true } }) : undefined;
  if (cursor && !anchor) throw missing();
  const drafts = await db.draft.findMany({
    where,
    orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { savedAt: "desc" }, { id: "desc" }],
    select: { id: true, savedName: true, savedTitle: true, savedAt: true, pinnedAt: true },
    ...(anchor ? { cursor: { id: anchor.id }, skip: 1 } : {}), take: 31,
  });
  return {
    items: drafts.slice(0, 30).map(({ id, savedName, savedTitle, savedAt, pinnedAt }) => ({
      id, name: savedName!, title: savedTitle ?? "", savedAt: savedAt!, updatedAt: savedAt!, pinnedAt,
    })),
    nextCursor: drafts.length > 30 ? drafts[29].id : null,
  };
});
api.post(`${prefix}/drafts`, async (req, reply) => {
  const ownerId = await owner(req);
  const { example, name } = z.object({ example: z.boolean().optional(), name: noteName.optional() }).parse(req.body ?? {});
  const initialData = example
    ? exampleDraft
    : applyBriefDefaultsToDraft(emptyDraft, await loadUserPreferences(ownerId));
  return reply.code(201).send(draftView(await db.draft.create({ data: { ownerId, name, data: initialData } })));
});
api.get(`${prefix}/drafts/:id`, async (req) => {
  const ownerId = await owner(req);
  return db.$transaction(async (tx) => {
    const draft = await tx.draft.findFirst({ where: { id: pathId(req), ownerId, deletedAt: null } });
    if (!draft) throw missing();
    const planning = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
    const runs = await tx.run.findMany({ where: { draftId: draft.id }, orderBy: { submissionOrder: "desc" }, take: 50 });
    const activeRuns = await tx.run.findMany({ where: { draftId: draft.id, baseRevision: { gte: draft.restoredRevision },
      status: inProgress, id: { notIn: runs.map(({ id }) => id) },
    } });
    const visibleRuns = [...runs, ...activeRuns].sort((a, b) => a.submissionOrder < b.submissionOrder ? -1 : 1);
    const final = await tx.finalization.findUnique({ where: { draftId_revision: { draftId: draft.id, revision: draft.revision } } });
    const brief = await tx.mediaBrief.findUnique({ where: { draftId: draft.id } });
    return { ...draftView(draft), runs: visibleRuns.map((run) => runView(run, draft.restoredRevision)),
      finalizationId: final?.id ?? null, brief: brief ? briefView(brief, draftSchema.parse(draft.data)) : null, planning: planView(planning) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
});
api.patch(`${prefix}/drafts/:id`, async (req) => {
  const draft = await ownedDraft(req);
  const { revision, data, name } = revisionSchema.extend({ data: draftSchema, name: noteName.nullable().optional() }).parse(req.body);
  if (data.coverId && !await db.media.findFirst({ where: { id: data.coverId, draftId: draft.id, mime: { startsWith: "image/" } } })) throw missing();
  if (data.videoId && !await db.media.findFirst({ where: { id: data.videoId, draftId: draft.id, mime: "video/mp4" } })) throw missing();
  if (data.imageIds.length && await db.media.count({ where: { id: { in: data.imageIds }, draftId: draft.id, mime: { startsWith: "image/" } } }) !== data.imageIds.length) throw missing();
  return update(draft, revision, data, name);
});

api.post(`${prefix}/drafts/:id/save`, async (req) => {
  const draft = await ownedDraft(req);
  const { revision } = revisionSchema.parse(req.body);
  if (revision !== draft.revision) throw conflict();
  if (!draft.name) throw invalid("请先填写笔记名");
  const name = noteName.parse(draft.name);
  const data = draftSchema.parse(draft.data);
  const [saved] = await db.draft.updateManyAndReturn({ where: { id: draft.id, revision, deletedAt: null },
    data: { savedName: name, savedTitle: data.title, savedData: data, savedAt: new Date(), updatedAt: draft.updatedAt } });
  if (!saved) throw conflict();
  return draftView(saved);
});

const inProgress = { in: ["queued", "running", "submitting", awaitingWriteback] };
async function endPending(tx: Prisma.TransactionClient, draftId: string) {
  await tx.run.updateMany({ where: { draftId, kind: mediaPreparationKind, status: { in: preparing } }, data: { status: "cancelled" } });
  await tx.mediaBrief.deleteMany({ where: { draftId, runId: null } });
  await tx.creationPlan.deleteMany({ where: { draftId } });
  await tx.run.updateMany({ where: { draftId, status: { in: ["queued", "running", awaitingWriteback] }, providerTaskId: null },
    data: { status: "failed", error: "工作稿已切换，此任务已结束。" } });
}

api.post(`${prefix}/drafts/:id/restore`, async (req) => {
  const owned = await ownedDraft(req);
  const { revision } = revisionSchema.parse(req.body);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${owned.id}::uuid FOR UPDATE`;
    const draft = await tx.draft.findUnique({ where: { id: owned.id, deletedAt: null } });
    if (!draft?.savedData || !draft.savedName || !draft.savedAt) throw missing();
    if (revision !== draft.revision) throw conflict();
    const pending = draftView(draft).hasUnsavedChanges ||
      await tx.mediaBrief.findFirst({ where: { draftId: draft.id, runId: null }, select: { id: true } }) ||
      await tx.creationPlan.findFirst({ where: { draftId: draft.id, OR: [
        { enabled: true }, { executionRunId: { not: null } }, { approved: false, latestRunId: { not: null } },
      ] }, select: { draftId: true } }) ||
      await tx.run.findFirst({ where: { draftId: draft.id, baseRevision: { gte: draft.restoredRevision }, status: inProgress }, select: { id: true } });
    if (!pending) return draftView(draft);
    const [restored] = await tx.draft.updateManyAndReturn({ where: { id: draft.id, revision, savedAt: draft.savedAt, deletedAt: null },
      data: { name: draft.savedName, data: draftSchema.parse(draft.savedData), revision: { increment: 1 }, restoredRevision: revision + 1 } });
    if (!restored) throw conflict();
    await endPending(tx, draft.id);
    return draftView(restored);
  });
});

api.patch(`${prefix}/drafts/:id/pin`, async (req, reply) => {
  const draft = await ownedDraft(req);
  if (!draft.savedAt) throw missing();
  const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);
  const [row] = await db.draft.updateManyAndReturn({ where: { id: draft.id, deletedAt: null }, data: {
    pinnedAt: pinned ? draft.pinnedAt ?? new Date() : null,
  } });
  if (!row) throw missing();
  return reply.send({ pinnedAt: row.pinnedAt });
});

api.delete(`${prefix}/drafts/:id`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { revision } = z.object({ revision: z.coerce.number().int().nonnegative().optional() }).parse(req.query);
  await db.$transaction(async (tx) => {
    const row = await tx.draft.updateMany({ where: { id: draft.id, deletedAt: null, revision }, data: { deletedAt: new Date(), revision: { increment: 1 } } });
    if (!row.count) throw revision === undefined ? missing() : conflict();
    await endPending(tx, draft.id);
  });
  return reply.code(204).send();
});
async function saveUploadedImage(req: FastifyRequest, draft: Draft, fieldname: "cover" | "image") {
  if (!req.isMultipart()) throw invalid("请上传图片文件");
  const file = await req.file();
  if (!file) throw invalid("请选择图片");
  const bytes = await file.toBuffer();
  const mime = imageType(bytes);
  if (!mime || file.fieldname !== fieldname) throw invalid("请选择 JPEG、PNG 或 WebP 图片");
  const id = randomUUID();
  await storeMedia(id, mime, bytes);
  try {
    await db.media.create({ data: { id, draftId: draft.id, mime, objectKey: id } });
  } catch (error) {
    await deleteMedia(id).catch(() => logGeneration("generation.api-error", {
      traceId: req.id, stage: "attachment-cleanup", outcome: "failed",
    }));
    throw error;
  }
  return id;
}

api.post(`${prefix}/drafts/:id/cover`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const coverId = await saveUploadedImage(req, draft, "cover");
  return reply.code(201).send({ coverId });
});
api.post(`${prefix}/drafts/:id/images`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const imageId = await saveUploadedImage(req, draft, "image");
  return reply.code(201).send({ imageId });
});
api.get(`${prefix}/media/:id`, async (req, reply) => {
  const media = await db.media.findFirst({ where: { id: pathId(req), draft: { ownerId: await owner(req), deletedAt: null } } });
  if (!media) throw missing();
  return sendMedia(reply, media, req.headers.range);
});
api.post(`${prefix}/drafts/:id/attachments`, async (req, reply) => {
  const draft = await ownedDraft(req);
  if (!req.isMultipart()) throw invalid("请选择聊天附件");
  const file = await req.file();
  if (!file || file.fieldname !== "attachment") throw invalid("请选择聊天附件");
  const bytes = await file.toBuffer();
  if (!bytes.length) throw invalid("附件为空");
  const name = file.filename.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f]/g, "").slice(-160) || "附件";
  let mime: string | undefined = imageType(bytes);
  if (!mime) {
    if (!/\.(txt|md|markdown)$/i.test(name)) throw invalid("请选择 JPG、PNG、WebP、TXT 或 Markdown");
    if (bytes.length > 256 * 1024) throw invalid("文本附件最多 256 KB");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw invalid("请使用 UTF-8 文本文件"); }
    if (text.includes("\0")) throw invalid("请使用 UTF-8 文本文件");
    if (Array.from(text).length > 12000) throw invalid("文本附件最多 12,000 字，请缩短后再上传");
    mime = "text/plain";
  }
  const id = randomUUID();
  await storeMedia(id, mime, bytes);
  try {
    return reply.code(201).send(attachmentInfo.parse(await db.chatAttachment.create({ data: { id, draftId: draft.id, name, mime, size: bytes.length } })));
  } catch (error) {
    await deleteMedia(id).catch(() => undefined);
    throw error;
  }
});
api.get(`${prefix}/attachments/:id`, async (req, reply) => {
  const file = await db.chatAttachment.findFirst({ where: { id: pathId(req), draft: { ownerId: await owner(req), deletedAt: null } } });
  if (!file) throw missing();
  if (file.mime === "text/plain") reply.header("Content-Disposition", "attachment");
  return sendMedia(reply, { objectKey: file.id, mime: file.mime });
});

api.get(`${prefix}/drafts/:id/workspace`, async (req) => {
  const draft = await ownedDraft(req);
  const [files, attachments, turns] = await Promise.all([
    workspaceFiles(db, draft.id),
    db.chatAttachment.findMany({ where: { draftId: draft.id } }),
    db.run.findMany({ where: { draftId: draft.id, kind: { in: ["plan", "revise", "generate"] } }, select: { input: true } }),
  ]);
  const sent = new Set(turns.flatMap(({ input }) => conversationInput.safeParse(input).data?.attachments?.map(({ id }) => id) ?? []));
  const registered = new Set(files.map(({ attachmentId }) => attachmentId));
  return {
    files: files.map((file) => ({
      id: file.id, name: file.name, mime: file.mime, attachmentId: file.attachmentId,
      versions: file.versions.map((version) => ({
        ...fileRef(file, version), size: version.size, createdAt: version.createdAt, draftRevision: version.draftRevision,
      })),
    })),
    attachments: attachments.filter(({ id }) => sent.has(id) && !registered.has(id)).map((file) => attachmentInfo.parse(file)),
  };
});

api.post(`${prefix}/drafts/:id/workspace`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { attachmentId } = z.object({ attachmentId: z.uuid() }).parse(req.body);
  const ref = await db.$transaction(async (tx) => {
    await lockWorkspace(tx, draft.id);
    const attachment = await tx.chatAttachment.findFirst({ where: { id: attachmentId, draftId: draft.id } });
    if (!attachment) throw missing();
    const existing = await tx.workspaceFile.findFirst({ where: { draftId: draft.id, attachmentId, deletedAt: null }, include: { versions: true } });
    if (existing) return fileRef(existing, existing.versions[0]);
    const file = await tx.workspaceFile.create({ data: {
      draftId: draft.id, attachmentId, name: attachment.name, mime: attachment.mime,
      versions: { create: { version: 1, objectKey: attachment.id, size: attachment.size, draftRevision: draft.revision } },
    }, include: { versions: true } });
    await tx.draft.update({ where: { id: draft.id }, data: { workspaceVersion: { increment: 1 } } });
    return fileRef(file, file.versions[0]);
  });
  return reply.code(201).send(ref);
});

api.delete(`${prefix}/drafts/:id/workspace/:fileId`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { fileId } = z.object({ fileId: z.uuid() }).parse(req.params);
  await db.$transaction(async (tx) => {
    await lockWorkspace(tx, draft.id);
    if (!(await tx.workspaceFile.updateMany({ where: { id: fileId, draftId: draft.id, deletedAt: null }, data: { deletedAt: new Date() } })).count) throw missing();
    await tx.draft.update({ where: { id: draft.id }, data: { workspaceVersion: { increment: 1 } } });
  });
  return reply.code(204).send();
});

api.get(`${prefix}/drafts/:id/workspace/:fileId/versions/:versionId`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { fileId, versionId } = z.object({ fileId: z.uuid(), versionId: z.uuid() }).parse(req.params);
  const { download } = z.object({ download: z.literal("1").optional() }).parse(req.query);
  const version = await db.workspaceVersion.findFirst({ where: { id: versionId, fileId,
    file: { draftId: draft.id, deletedAt: null } }, include: { file: true } });
  if (!version) throw missing();
  reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "default-src 'none'");
  if (download) {
    const name = encodeURIComponent(version.file.name).replace(/['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16));
    reply.header("Content-Disposition", "attachment; filename*=UTF-8''" + name);
  }
  return reply.type(version.file.mime.startsWith("image/") ? version.file.mime : "text/plain; charset=utf-8")
    .send(await mediaBytes(version.objectKey));
});

async function chatProfile(files: z.infer<typeof attachmentInfo>[], workspaceVision = false) {
  const vision = workspaceVision || files.some((file) => file.mime.startsWith("image/"));
  const profile = await latest(vision ? "vision" : "text");
  if (vision && (!profile || !hasMasterKey())) throw invalid("star 暂时读不了图片。请移除图片再发送，或联系管理员配置视觉模型。");
  if (profile && !hasMasterKey()) throw invalid("文字模型配置不可用，请联系管理员");
  return profile;
}

api.post(`${prefix}/drafts/:id/plan`, async (req) => {
  const draft = await ownedDraft(req);
  const { enabled, restart } = z.object({ enabled: z.boolean(), restart: z.boolean().optional() }).parse(req.body);
  return db.$transaction(async (tx) => {
    await lockWorkingDraft(tx, draft);
    const previous = await tx.creationPlan.upsert({ where: { draftId: draft.id }, update: {},
      create: { draftId: draft.id, enabled, media: [] } });
    const execution = previous.executionRunId ? await tx.run.findUnique({ where: { id: previous.executionRunId } }) : null;
    if (restart && execution && ["queued", "running", awaitingWriteback].includes(execution.status)) throw invalid("计划正在执行");
    if (restart && previous.approved && plannedMedia.parse(previous.media).length) {
      await tx.mediaBrief.deleteMany({ where: { draftId: draft.id, id: { in: plannedMedia.parse(previous.media).map(({ id }) => id) }, runId: null } });
    }
    const rows = await tx.creationPlan.updateManyAndReturn({ where: { draftId: draft.id, version: previous.version }, data: {
      enabled, version: { increment: 1 }, ...(restart ? { latestRunId: null, executionRunId: null, approved: false, media: [] } : {}),
    } });
    if (!rows[0]) throw conflict();
    return planView(rows[0]);
  });
});
api.post(`${prefix}/drafts/:id/runs`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const data = draftSchema.parse(draft.data);
  const submission = submissionSchema.parse(req.body);
  const fingerprint = requestFingerprint("runs", draft.id, submission);
  const existing = await db.run.findUnique({ where: { id: submission.requestId } });
  if (existing) return reply.code(202).send(runView(replayRun(existing, draft, fingerprint, "runs", submission), draft.restoredRevision));
  if (draft.revision !== submission.revision) throw conflict();
  const { kind, prompt } = submission;
  if (kind === "analyze" && !data.settings.reference.trim()) throw invalid("请粘贴参考笔记");
  if (kind === "generate" && data.settings.mode === "original" && !data.settings.topic.trim()) throw invalid("请填写创作主题");
  if ((kind === "revise" || kind === "plan") && !prompt && !submission.attachments.length && !submission.workspace.length) throw invalid("请输入想和 star 讨论的内容");
  const files = await db.chatAttachment.findMany({ where: { draftId: draft.id, id: { in: submission.attachments } } });
  if (files.length !== submission.attachments.length) throw missing();
  const attachments = submission.attachments.map((id) => attachmentInfo.parse(files.find((file) => file.id === id)));
  const recent = await db.run.findMany({ where: { draftId: draft.id, baseRevision: { gte: draft.restoredRevision },
    status: "succeeded", kind: { in: ["generate", "revise", "plan"] },
  }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 24 });
  const retry = submission.retryOf ? await db.run.findFirst({ where: { id: submission.retryOf, draftId: draft.id, kind,
    OR: [{ status: "failed" }, { status: "succeeded", appliedRevision: null,
      OR: [{ baseRevision: { lt: draft.revision } }, { result: { path: ["superseded"], equals: true } }] }],
  } }) : null;
  if (submission.retryOf && (!retry || retry.prompt !== prompt || retry.baseRevision < draft.restoredRevision)) throw invalid("无法重试这条消息");
  const requested = requestedArtifact(prompt ?? "", Boolean(submission.artifactTarget));
  let creativeTask: z.infer<typeof jobInputSchema>["creativeTask"];
  if (prompt && (kind === "revise" || kind === "plan") && (!requested || isWritingRequest(prompt))) {
    const turns = await db.run.findMany({ where: { draftId: draft.id, baseRevision: { gte: draft.restoredRevision }, kind, status: { in: ["succeeded", "failed"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 });
    const mediaIds = turns.flatMap((turn) => {
      const result = resultSchema.safeParse(turn.result).data;
      return result?.media?.map(({ id }) => id) ?? (result?.cover ? [result.cover.id] : []);
    });
    const submittedMedia = mediaIds.length ? await db.run.findMany({ where: { draftId: draft.id, id: { in: mediaIds },
      kind: { in: mediaKind.options } }, select: { id: true } }) : [];
    creativeTask = (retry ? jobInputSchema.parse(retry.input).creativeTask : undefined)
      ?? resolveCreativeTask(prompt, data, turns.filter((turn) => !conversationInput.safeParse(turn.input).data?.planExecution), submission.requestId,
        new Set(submittedMedia.map(({ id }) => id)));
  }
  let analysis: z.infer<typeof resultSchema>["analysis"];
  if (kind === "generate" && data.settings.mode === "rewrite") {
    const previousRuns = await db.run.findMany({
      where: { draftId: draft.id, kind: "analyze", status: "succeeded",
        input: { path: ["draft", "settings", "reference"], equals: data.settings.reference } },
      orderBy: { createdAt: "desc" }, take: 30,
    });
    const identity = referenceIdentity(data.settings);
    const previous = previousRuns.find((run) => referenceFromAnalysis(run.input)?.referenceIdentity === identity);
    analysis = previous ? resultSchema.parse(previous.result).analysis : undefined;
    if (!analysis) throw invalid("请先解析当前参考笔记");
  }
  const history = recent.filter((run) => !conversationInput.safeParse(run.input).data?.planExecution).slice(0, 12).reverse().map((run) => {
    const result = resultSchema.safeParse(run.result).data;
    const isCandidate = Boolean(result?.patch && (run.appliedRevision === null || run.undoneAt));
    const message = !result || isCandidate || result.superseded || isPlaceholder(result.message) ? "" : result.message;
    const response = result?.plan ? [message, ...result.plan.map(({ instruction }) => instruction)].filter(Boolean).join("\n") : message;
    return { request: run.prompt ?? "生成笔记", response };
  });
  const library = kind === "analyze" ? [] : await workspaceFiles(db, draft.id);
  const refs = library.flatMap((file) => file.versions[0] ? [fileRef(file, file.versions[0])] : []);
  const explicitIds = [...new Set(submission.workspace)];
  const explicit = explicitIds.map((id) => refs.find(({ fileId }) => fileId === id));
  if (explicit.some((ref) => !ref)) throw missing();
  const activePlan = kind === "plan" ? await db.creationPlan.findUnique({ where: { draftId: draft.id } }) : null;
  const previousPlan = recent.find(({ id }) => id === activePlan?.latestRunId);
  const previousDependencies = resultSchema.safeParse(previousPlan?.result).data?.workspaceDependencies ?? [];
  const continuedSources = previousDependencies.flatMap(({ fileId }) => refs.filter((ref) => ref.fileId === fileId));
  const artifactWrite = kind === "revise" ? requested : undefined;
  const targets = requested === "update" ? artifactTarget(refs, prompt ?? "", submission.artifactTarget) : [];
  if ((kind === "revise" || kind === "plan") && requested === "update" && targets.length !== 1) {
    throw invalid("请在工作区选择要更新的 Markdown 文件，再发送这条消息。");
  }
  const selectedSources = [...targets, ...explicit.filter((ref) => ref !== undefined), ...continuedSources];
  let profile = await chatProfile(attachments);
  if (kind === "analyze" && data.settings.referenceMeta?.images?.length && hasMasterKey()) {
    profile = await latest("vision") ?? profile;
  }
  const ranked = profile?.toolsVerified ? [] : await rankSources(refs,
    [prompt, data.title, data.settings.topic, creativeTask?.request].filter(Boolean).join(" "),
    (ref) => library.find(({ id }) => id === ref.fileId)?.versions[0]?.objectKey,
  );
  const sources = [...new Map([...selectedSources, ...ranked].map((ref) => [ref.fileId, ref])).values()].slice(0, 7);
  if (sources.some(({ mime }) => mime.startsWith("image/")) && hasMasterKey()) profile = await latest("vision") ?? profile;
  const unreadImages = profile?.capability !== "vision" && sources.some(({ mime }) => mime.startsWith("image/"));
  const workspaceSources = sources.filter(({ mime }) => !unreadImages || !mime.startsWith("image/"));
  const services = kind === "analyze" ? await generationServices() : null;
  const workerReady = services ? services.redis && services.worker : true;
  const run = await db.$transaction(async (tx) => {
    const duplicate = await lockRequest(tx, submission.requestId);
    if (duplicate) return { run: replayRun(duplicate, draft, fingerprint, "runs", submission), replayed: true };
    await lockWorkingDraft(tx, draft);
    if (!await currentDependencies(tx, draft.id, sources)) throw invalid("工作区资料已变化，请重新发送");
    if (kind !== "analyze") await requireGenerationReady();
    if (kind === "plan") {
      const planning = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
      if (!planning?.enabled || planning.approved) throw invalid("请先开启计划模式，或结束当前执行");
      const latestTurn = planning.latestRunId ? await tx.run.findUnique({ where: { id: planning.latestRunId } }) : null;
      if (latestTurn && ["queued", "running"].includes(latestTurn.status)) throw invalid("star 正在整理上一条计划消息");
      const claimed = await tx.creationPlan.updateMany({ where: { draftId: draft.id, version: planning.version, enabled: true, approved: false },
        data: { latestRunId: submission.requestId, version: { increment: 1 } } });
      if (!claimed.count) throw conflict();
    }
    const created = await tx.run.create({
      data: { id: submission.requestId, draftId: draft.id, kind, requestFingerprint: fingerprint,
        status: workerReady ? "queued" : "running",
        prompt: prompt || (attachments.length || explicitIds.length ? "请参考当前附件" : undefined),
        baseRevision: draft.revision, profileId: profile?.id,
        input: { draft: data, ...(analysis ? { analysis } : {}), history, attachments, workspaceSources,
          workspaceRequired: [...explicitIds, ...targets.map(({ fileId }) => fileId), ...continuedSources.map(({ fileId }) => fileId)],
          explicitWorkspace: explicitIds, ...(submission.artifactTarget ? { chosenArtifact: submission.artifactTarget } : {}),
          ...(unreadImages ? { unreadImages: true } : {}), ...(artifactWrite ? { artifactWrite } : {}),
          ...(targets.length ? { artifactTargets: targets } : {}),
          ...(creativeTask ? { creativeTask } : {}),
          ...(kind === "revise" && !creativeTask && prompt && isMediaOnlyRequest(prompt) ? { mediaOnly: true } : {}) } },
    });
    return { run: created, replayed: false };
  });
  if (!run.replayed && kind === "analyze" && !workerReady) {
    void executeAnalyzeRun(run.run).catch(async (error) => {
      const feedback = error instanceof ModelOutputError || error instanceof ContextLimitError
        ? error.message
        : "参考结构解析暂时失败，请检查模型配置或稍后重试。";
      await failRun(run.run, feedback).catch(() => undefined);
    });
  }
  logGeneration(run.replayed ? "generation.replayed" : "generation.accepted", {
    traceId: req.id, runId: run.run.id, draftId: draft.id, kind,
  });
  return reply.code(202).send(runView(run.run, draft.restoredRevision));
});
api.post(`${prefix}/drafts/:id/plan/execute`, async (req) => {
  const draft = await ownedDraft(req);
  const { runId, revision } = revisionSchema.extend({ runId: z.uuid() }).parse(req.body);
  const planning = await db.creationPlan.findUnique({ where: { draftId: draft.id } });
  if (!planning || planning.latestRunId !== runId) throw conflict();
  const existing = planning.executionRunId ? await db.run.findUnique({ where: { id: planning.executionRunId } }) : null;
  if (planning.approved) return { planning: planView(planning), run: existing ? runView(existing) : null };
  if (!planning.enabled || draft.revision !== revision) throw conflict();
  const proposal = await db.run.findFirst({ where: { id: runId, draftId: draft.id, kind: "plan", status: "succeeded",
    baseRevision: { gte: draft.restoredRevision } } });
  if (!proposal) throw conflict();
  const proposed = resultSchema.parse(proposal.result);
  const actions = proposed.plan;
  if (!actions) throw invalid("star 还在整理计划");
  const writes = actions.filter(({ kind }) => kind === "write" || kind === "artifact");
  const artifacts = writes.filter(({ kind }) => kind === "artifact");
  const media = actions.flatMap(({ kind, instruction }) => kind === "write" || kind === "artifact" ? [] : [{ id: randomUUID(), kind, instruction }]);
  const input = jobInputSchema.parse(proposal.input);
  const dependencies = proposed.workspaceDependencies ?? proposed.sources ?? input.workspaceSources ?? [];
  const targets = artifacts.map(({ targetId }) => targetId
    ? dependencies.find(({ fileId, mime }) => fileId === targetId && mime === "text/markdown") : null);
  const updateIds = targets.flatMap((ref) => ref ? [ref.fileId] : []);
  if (artifacts.length > 3 || targets.includes(undefined) || new Set(updateIds).size !== updateIds.length) {
    throw invalid("计划中的文件目标不明确，请重新讨论，并选择要更新的文件");
  }
  const profile = writes.length ? await chatProfile(input.attachments, dependencies.some(({ mime }) => mime.startsWith("image/"))) : null;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draft.id}::uuid FOR UPDATE`;
    const currentDraft = await tx.draft.findUnique({ where: { id: draft.id, deletedAt: null } });
    if (!currentDraft) throw missing();
    const currentPlan = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
    if (currentPlan?.approved && currentPlan.latestRunId === runId) {
      const run = currentPlan.executionRunId ? await tx.run.findUnique({ where: { id: currentPlan.executionRunId } }) : null;
      return { planning: planView(currentPlan), run: run ? runView(run, currentDraft.restoredRevision) : null };
    }
    if (currentDraft.revision !== revision || currentPlan?.version !== planning.version) throw conflict();
    if (!await currentDependencies(tx, draft.id, dependencies)) throw invalid("计划引用的工作区资料已变化，请重新讨论计划");
    if (writes.length) await requireGenerationReady();
    const executionId = writes.length ? randomUUID() : null;
    const rows = await tx.creationPlan.updateManyAndReturn({ where: { draftId: draft.id, version: planning.version, approved: false },
      data: { approved: true, executionRunId: executionId, media, version: { increment: 1 } } });
    if (!rows[0]) {
      const current = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
      if (!current?.approved || current.latestRunId !== runId) throw conflict();
      const run = current.executionRunId ? await tx.run.findUnique({ where: { id: current.executionRunId } }) : null;
      return { planning: planView(current), run: run ? runView(run) : null };
    }
    const run = executionId ? await tx.run.create({ data: {
      id: executionId, draftId: draft.id, kind: "revise", baseRevision: revision, profileId: profile?.id,
      prompt: writes.map(({ instruction }) => instruction).join("\n"), input: {
        draft: draftSchema.parse(currentDraft.data), history: input.history, attachments: input.attachments,
        workspaceSources: dependencies, workspaceRequired: dependencies.map(({ fileId }) => fileId),
        planExecution: true, planWritesNote: writes.some(({ kind }) => kind === "write"),
        ...(artifacts.length ? { artifactWrite: updateIds.length ? "update" : "create", artifactCount: artifacts.length,
          artifactTargets: targets.map((target) => target ?? null) } : {}),
      },
    } }) : null;
    return { planning: planView(rows[0]), run: run ? runView(run) : null };
  }).then((outcome) => {
    if (outcome.run) logGeneration("generation.accepted", { traceId: req.id, runId: outcome.run.id, draftId: draft.id, kind: "revise", stage: "execute-plan" });
    return outcome;
  });
});

api.post(`${prefix}/drafts/:id/plan/media`, async (req) => {
  const draft = await ownedDraft(req);
  const { stepId, skip } = z.object({ stepId: z.uuid(), skip: z.boolean().optional() }).parse(req.body);
  const note = draftSchema.parse(draft.data);
  return db.$transaction(async (tx) => {
    await lockWorkingDraft(tx, draft);
    if (await activeMediaPreparation(tx, draft.id)) throw preparationBusy();
    const planning = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
    if (!planning?.approved || planning.executionRunId) throw invalid("文案步骤尚未完成");
    const [step, ...remaining] = plannedMedia.parse(planning.media);
    if (!step || step.id !== stepId) throw conflict();
    const current = await tx.mediaBrief.findUnique({ where: { draftId: draft.id } });
    if (skip) {
      await tx.mediaBrief.deleteMany({ where: { id: stepId, draftId: draft.id, runId: null } });
      const rows = await tx.creationPlan.updateManyAndReturn({ where: { draftId: draft.id, version: planning.version },
        data: { media: remaining, enabled: Boolean(remaining.length), version: { increment: 1 } } });
      if (!rows[0]) throw conflict();
      return { planning: planView(rows[0]), brief: null };
    }
    if (current?.id === stepId && !current.runId) return { planning: planView(planning), brief: briefView(current, note) };
    if (current && !current.runId) throw invalid("请先处理对话中已有的媒体需求");
    const data = { kind: step.kind, prompt: step.instruction, confirmationOnly: true, noteFingerprint: mediaNoteFingerprint(note),
      messages: [{ role: "user", text: step.instruction }] };
    const brief = await tx.mediaBrief.upsert({ where: { draftId: draft.id },
      create: { id: stepId, draftId: draft.id, data }, update: { id: stepId, data, runId: null, version: { increment: 1 } } });
    return { planning: planView(planning), brief: briefView(brief, note) };
  });
});
async function confirmBrief(draft: Draft, brief: MediaBrief, input: z.infer<typeof mediaInput>) {
  const { kind, messages, sourceRunId, requiresAppliedWriting } = briefSchema.parse(brief.data);
  const existing = brief.runId ? await db.run.findUnique({ where: { id: brief.runId } }) : null;
  if (existing) return existing;
  const target: MediaKind = kind === "video" ? (input.sourceCoverId ? "imageToVideo" : "textToVideo") : kind;
  const note = draftSchema.parse(draft.data);
  if (input.sourceCoverId && (kind !== "video" || input.sourceCoverId !== note.coverId ||
    !await db.media.findFirst({ where: { id: input.sourceCoverId, draftId: draft.id, mime: { startsWith: "image/" } } }))) {
    throw invalid("当前封面已变化，请重新选择首帧");
  }
  if ((kind === "image" && input.ratio === "9:16") || (target === "textToVideo" && input.ratio === "3:4")) throw invalid("模型不支持此画面比例");
  const profile = await latest(profileForMedia(target));
  if (!profile || !hasMasterKey()) throw invalid("请先由管理员配置此媒体模型");
  return db.$transaction(async (tx) => {
    const replay = await lockRequest(tx, brief.id);
    if (replay?.draftId === draft.id && replay.kind === target && (replay.input as { messages?: unknown })?.messages) return replay;
    if (replay) throw requestIdConflict();
    const current = await lockWorkingDraft(tx, draft);
    if (await activeMediaPreparation(tx, draft.id)) throw preparationBusy();
    if (briefView(brief, note).stale) throw staleMediaBrief();
    await requireGenerationReady();
    const claimed = await tx.mediaBrief.updateMany({ where: { id: brief.id, version: brief.version, runId: null }, data: { runId: brief.id } });
    if (!claimed.count) {
      const duplicate = await tx.run.findUnique({ where: { id: brief.id } });
      if (duplicate && duplicate.draftId === draft.id) return duplicate;
      throw conflict();
    }
    if (sourceRunId && !await tx.run.findFirst({ where: { id: sourceRunId, draftId: draft.id,
      baseRevision: { gte: current.restoredRevision }, ...(requiresAppliedWriting !== false ? { appliedRevision: { not: null } } : {}), undoneAt: null } })) {
      throw invalid("关联的文案或媒体方案已失效，请基于当前工作稿重新准备");
    }
    const planning = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
    if (planning?.approved) {
      const [step, ...media] = plannedMedia.parse(planning.media);
      if (step?.id === brief.id) {
        const changed = await tx.creationPlan.updateMany({ where: { draftId: draft.id, version: planning.version },
          data: { media, enabled: Boolean(media.length), version: { increment: 1 } } });
        if (!changed.count) throw conflict();
      }
    }
    return tx.run.create({ data: { id: brief.id, draftId: draft.id, kind: target, prompt: input.prompt, baseRevision: draft.revision,
      profileId: profile.id, input: { ...input, messages } } });
  });
}
const mediaBriefRequest = revisionSchema.extend({
  requestId: z.uuid().optional(),
  kind: briefKind.optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  fromComposer: z.literal(true).optional(),
  replace: briefVersion.optional(),
  answer: briefVersion.extend({ choice: z.number().int().min(0).max(2).optional() }).optional(),
  refresh: briefVersion.optional(),
  retryOf: z.uuid().optional(),
});

api.post(`${prefix}/drafts/:id/media-brief`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const input = mediaBriefRequest.parse(req.body);
  const fingerprint = createHash("sha256").update(JSON.stringify([
    "media-brief", draft.id, input.revision, input.kind, input.message, input.fromComposer, input.answer, input.replace, input.refresh, input.retryOf,
  ])).digest("hex");
  const note = draftSchema.parse(draft.data);
  const outcome = await db.$transaction(async (tx) => {
    const duplicate = input.requestId ? await lockRequest(tx, input.requestId) : null;
    if (duplicate) {
      if (duplicate.draftId !== draft.id || duplicate.kind !== mediaPreparationKind || duplicate.requestFingerprint !== fingerprint) {
        throw requestIdConflict();
      }
      const prior = await tx.mediaBrief.findUnique({ where: { draftId: draft.id } });
      return { matched: true, brief: prior ? briefView(prior, note) : null, run: duplicate, replayed: true };
    }
    const current = await lockWorkingDraft(tx, draft);
    if (current.revision !== input.revision) throw conflict();
    const prior = await tx.mediaBrief.findUnique({ where: { draftId: draft.id } });
    const ongoing = prior && !prior.runId ? prior : null;
    const previous = ongoing && !input.replace ? briefView(ongoing, note) : null;
    const guard = input.replace ?? input.answer ?? input.refresh;
    if (guard && (!ongoing || guard.briefId !== ongoing.id || guard.version !== ongoing.version)) throw conflict();
    if ([input.replace, input.answer, input.refresh, input.retryOf].filter(Boolean).length > 1) {
      throw invalid("请只选择一种媒体方案操作");
    }
    if ((input.refresh || input.retryOf) && (input.kind || input.message || input.fromComposer)) {
      throw invalid("重新整理会使用此前保存的媒体要求");
    }
    const retry = input.retryOf ? await tx.run.findFirst({
      where: { id: input.retryOf, draftId: draft.id, kind: mediaPreparationKind, baseRevision: { gte: current.restoredRevision },
        OR: [{ status: "failed" }, { status: "succeeded", result: { path: ["preparation", "state"], equals: "stale" } }] },
    }) : null;
    const priorInput = retry ? preparationInput.parse(retry.input) : null;
    if (input.retryOf && (!priorInput || !sameBrief(priorInput.expectedBrief, prior))) throw conflict();
    const explicit = input.kind ?? (input.message && !(input.fromComposer && isWritingRequest(input.message)) ? mediaIntent(input.message) : undefined);
    const kind = priorInput?.kind ?? (input.fromComposer ? explicit : input.kind ?? previous?.kind ?? explicit);
    if (!kind) return { matched: false, brief: null, run: null };
    if (await activeMediaPreparation(tx, draft.id)) throw preparationBusy();
    if (!input.refresh && !priorInput && previous && (input.fromComposer || input.kind)) {
      return { matched: true, brief: previous, run: null, ...(kind !== previous.kind && input.fromComposer ? { switchTo: kind } : {}) };
    }
    const choice = input.answer?.choice;
    const option = choice === undefined ? undefined : previous?.options[choice];
    if (choice !== undefined && !option) throw invalid("该方案已更新，请重新选择");
    if (input.answer && previous?.stale) throw staleMediaBrief();
    if (input.answer && !option && !input.message) throw invalid("请填写画面要求");
    const basis = priorInput ?? previous;
    const feedback = input.refresh || priorInput
      ? basis?.messages.filter(({ role }) => role === "user") ?? []
      : [...(previous?.messages ?? []), { role: "user" as const, text: option ? option.title : input.message ?? briefLabels[kind] }];
    const messages = feedback.slice(-24);
    const link = !input.refresh && !priorInput && basis?.sourceRunId
      ? { sourceRunId: basis.sourceRunId, requiresAppliedWriting: basis.requiresAppliedWriting } : {};
    if (option && ongoing) {
      const selected = await tx.mediaBrief.update({ where: { draftId: draft.id }, data: {
        version: { increment: 1 }, data: { kind, confirmationOnly: true, noteFingerprint: mediaNoteFingerprint(note), ...link,
          messages: [...messages, { role: "assistant", text: "可以检查并确认生成要求。" }].slice(-24), prompt: option.prompt },
      } });
      return { matched: true, brief: briefView(selected, note), run: null };
    }
    if (!input.requestId) throw invalid("整理媒体方案需要请求编号");
    await requireGenerationReady();
    const profile = await latest("text");
    if (profile && !hasMasterKey()) throw invalid("文字模型配置不可用，请联系管理员");
    const run = await tx.run.create({ data: {
      id: input.requestId, draftId: draft.id, kind: mediaPreparationKind, baseRevision: current.revision,
      requestFingerprint: fingerprint, profileId: profile?.id,
      prompt: messages.at(-1)?.text ?? briefLabels[kind],
      input: { kind, note: { title: note.title, body: note.body }, messages, expectedBrief: briefIdentity(prior),
        briefId: priorInput?.briefId ?? previous?.id ?? randomUUID(), ...link },
    } });
    return { matched: true, brief: ongoing ? briefView(ongoing, note) : null, run, replayed: false };
  });
  const { run, replayed, ...response } = outcome;
  if (!run) return { ...response, run: null };
  logGeneration(replayed ? "generation.replayed" : "generation.accepted", {
    traceId: req.id, draftId: draft.id, runId: run.id, kind: run.kind, stage: "prepare",
  });
  return reply.code(202).send({ ...response, run: runView(run, draft.restoredRevision) });
});
api.post(`${prefix}/drafts/:id/media-brief/preparations/:runId/cancel`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { runId } = z.object({ runId: z.uuid() }).parse(req.params);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draft.id}::uuid FOR UPDATE`;
    const run = await tx.run.findFirst({ where: { id: runId, draftId: draft.id, kind: mediaPreparationKind } });
    if (!run) throw missing();
    if (run.status === "cancelled") return;
    if (!preparing.includes(run.status)) throw conflict();
    await tx.run.update({ where: { id: run.id }, data: { status: "cancelled" } });
  });
  return reply.code(204).send();
});
api.post(`${prefix}/drafts/:id/media-brief/cancel`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { briefId, version } = briefVersion.parse(req.body);
  await db.$transaction(async (tx) => {
    await lockWorkingDraft(tx, draft);
    if (await activeMediaPreparation(tx, draft.id)) throw preparationBusy();
    const deleted = await tx.mediaBrief.deleteMany({ where: { id: briefId, draftId: draft.id, version, runId: null } });
    if (!deleted.count) throw conflict();
  });
  return reply.code(204).send();
});
api.post(`${prefix}/drafts/:id/media-brief/confirm`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const input = mediaInput.extend({ ...briefVersion.shape, ...revisionSchema.shape }).parse(req.body);
  const duplicate = await db.run.findFirst({ where: { id: input.briefId, draftId: draft.id, kind: { in: mediaKind.options } } });
  if (duplicate) {
    if (!(duplicate.input as { messages?: unknown }).messages) throw requestIdConflict();
    return reply.code(202).send(runView(duplicate, draft.restoredRevision));
  }
  const brief = await db.mediaBrief.findFirst({ where: { id: input.briefId, draftId: draft.id, version: input.version } });
  if (!brief || !briefSchema.parse(brief.data).prompt) throw conflict();
  if (!brief.runId && draft.revision !== input.revision) throw conflict();
  if (briefView(brief, draftSchema.parse(draft.data)).stale) throw staleMediaBrief();
  const { prompt, ratio, duration, sourceCoverId } = input;
  const run = await confirmBrief(draft, brief, mediaInput.parse({ prompt, ratio, duration, sourceCoverId }));
  logGeneration("generation.accepted", { traceId: req.id, runId: run.id, draftId: draft.id, kind: run.kind, stage: "confirm-media" });
  return reply.code(202).send(runView(run));
});
api.post(`${prefix}/drafts/:id/media-runs`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const input = revisionSchema.extend({ kind: z.literal("cover"), requestId: z.uuid() }).parse(req.body);
  const fingerprint = requestFingerprint("media-runs", draft.id, input);
  const existing = await db.run.findUnique({ where: { id: input.requestId } });
  if (existing) return reply.code(202).send(runView(replayRun(existing, draft, fingerprint, "media-runs", input), draft.restoredRevision));
  if (draft.revision !== input.revision) throw conflict();
  const data = draftSchema.parse(draft.data);
  const context = noteContext(data);
  if (!context) throw invalid("请先填写标题或正文");
  const prompt = `根据笔记为它生成封面，画面主体清晰，留出适合放标题的空间。\n${context}`;
  const profile = await latest("cover");
  if (!profile || !hasMasterKey()) throw invalid("请先由管理员配置此媒体模型");
  const run = await db.$transaction(async (tx) => {
    const duplicate = await lockRequest(tx, input.requestId);
    if (duplicate) return { run: replayRun(duplicate, draft, fingerprint, "media-runs", input), replayed: true };
    await lockWorkingDraft(tx, draft);
    if (await activeMediaPreparation(tx, draft.id)) throw preparationBusy();
    await requireGenerationReady();
    const created = await tx.run.create({
      data: { id: input.requestId, draftId: draft.id, kind: input.kind, baseRevision: draft.revision,
        requestFingerprint: fingerprint, profileId: profile.id, input: { prompt } },
    });
    return { run: created, replayed: false };
  });
  logGeneration(run.replayed ? "generation.replayed" : "generation.accepted", {
    traceId: req.id, runId: run.run.id, draftId: draft.id, kind: input.kind,
  });
  return reply.code(202).send(runView(run.run, draft.restoredRevision));
});
api.get(`${prefix}/drafts/:id/run-status`, async (req) => {
  const ownerId = await owner(req);
  const { ids } = z.object({ ids: z.string().max(1849).optional() }).parse(req.query);
  const tracked = [...new Set(z.array(z.uuid()).max(50).parse(ids ? ids.split(",") : []))];
  return db.$transaction(async (tx) => {
    const draft = await tx.draft.findFirst({
      where: { id: pathId(req), ownerId, deletedAt: null },
      select: { id: true, data: true, revision: true, restoredRevision: true, workspaceVersion: true },
    });
    if (!draft) throw missing();
    const select = { id: true, kind: true, status: true, updatedAt: true, baseRevision: true, toolProgress: true } as const;
    const [recent, active, brief, planning] = await Promise.all([
      tx.run.findMany({ where: { draftId: draft.id }, orderBy: { submissionOrder: "desc" }, take: 50, select }),
      tx.run.findMany({ where: { draftId: draft.id, OR: [
        { id: { in: tracked } }, { status: inProgress, baseRevision: { gte: draft.restoredRevision } },
      ] }, select }),
      tx.mediaBrief.findUnique({ where: { draftId: draft.id }, select: { id: true, data: true, version: true, runId: true } }),
      tx.creationPlan.findUnique({ where: { draftId: draft.id }, select: { version: true } }),
    ]);
    const runs = new Map([...recent, ...active].map(({ baseRevision, ...run }) =>
      [run.id, { ...run, toolProgress: toolProgressSchema.safeParse(run.toolProgress).data ?? [], archived: baseRevision < draft.restoredRevision }]));
    return {
      revision: draft.revision,
      workspaceVersion: draft.workspaceVersion,
      briefVersion: brief ? [brief.id, brief.version, brief.runId ?? ""].join(":") : null,
      briefStale: brief ? briefView(brief, draftSchema.parse(draft.data)).stale : false,
      planningVersion: planning?.version ?? null,
      runs: [...runs.values()],
      missing: tracked.filter((id) => !runs.has(id)),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
});
api.get(`${prefix}/runs/:id`, async (req) => {
  const run = await db.run.findFirst({ where: { id: pathId(req), draft: { ownerId: await owner(req), deletedAt: null } },
    include: { draft: { select: { restoredRevision: true } } } });
  if (!run) throw missing();
  return runView(run, run.draft.restoredRevision);
});
async function openMediaProposal(req: FastifyRequest) {
  const id = pathId(req);
  const ownerId = await owner(req);
  const { revision, proposalId } = revisionSchema.extend({ proposalId: z.uuid().optional() }).parse(req.body);
  return db.$transaction(async (tx) => {
    const run = await tx.run.findFirst({ where: { id, draft: { ownerId, deletedAt: null } }, include: { draft: true } });
    if (!run) throw missing();
    await lockWorkingDraft(tx, run.draft);
    if (run.baseRevision < run.draft.restoredRevision) throw invalid("这份媒体方案来自已结束的工作稿");
    const result = resultSchema.safeParse(run.result).data;
    const proposals = result?.media ?? (result?.cover ? [{ ...result.cover, kind: "cover" as const }] : []);
    const proposal = proposals.find((item) => proposalId ? item.id === proposalId : item.kind === "cover");
    if (!proposal || !["revise", "generate"].includes(run.kind) || run.status !== "succeeded") throw invalid("这条消息暂无该媒体方案");
    const generated = await tx.run.findFirst({ where: { id: proposal.id, draftId: run.draftId, kind: { in: mediaKind.options } } });
    if (generated) return { brief: null, submitted: true, blocked: false };
    const requiresAppliedWriting = Boolean(result?.patch && Object.keys(result.patch).length);
    if ((requiresAppliedWriting && run.appliedRevision === null) || run.undoneAt) throw invalid("请先应用这篇文案");
    if (run.draft.revision !== revision) throw conflict();
    const note = draftSchema.parse(run.draft.data);
    const previous = await tx.mediaBrief.findUnique({ where: { draftId: run.draftId } });
    if (previous?.id === proposal.id) return { brief: briefView(previous, note), submitted: false, blocked: false };
    if (previous && !previous.runId) return { brief: briefView(previous, note), submitted: false, blocked: true };
    if (await activeMediaPreparation(tx, run.draftId)) throw preparationBusy();
    const originalNote = jobInputSchema.safeParse(run.input).data?.draft ?? note;
    const data = { kind: proposal.kind, prompt: proposal.prompt, confirmationOnly: true, sourceRunId: id, requiresAppliedWriting,
      noteFingerprint: mediaNoteFingerprint({ ...originalNote, ...result?.patch }),
      messages: [{ role: "user", text: (run.prompt ?? briefLabels[proposal.kind]).slice(0, 3000) }] };
    if (!previous) {
      const brief = await tx.mediaBrief.create({ data: { draftId: run.draftId, id: proposal.id, data } }).catch((error: { code?: string }) => {
        if (error.code === "P2002") throw conflict();
        throw error;
      });
      return { brief: briefView(brief, note), submitted: false, blocked: false };
    }
    const [brief] = await tx.mediaBrief.updateManyAndReturn({
      where: { id: previous.id, version: previous.version, runId: previous.runId },
      data: { id: proposal.id, data, runId: null, version: { increment: 1 } },
    });
    if (!brief) throw conflict();
    return { brief: briefView(brief, note), submitted: false, blocked: false };
  });
}
api.post(`${prefix}/runs/:id/cover-brief`, openMediaProposal);
api.post(`${prefix}/runs/:id/media-proposal`, openMediaProposal);
api.post(`${prefix}/runs/:id/resume`, async (req) => {
  const run = await db.run.findFirst({ where: { id: pathId(req), draft: { ownerId: await owner(req), deletedAt: null } },
    include: { draft: { select: { restoredRevision: true } } } });
  if (!run) throw missing();
  if (run.baseRevision < run.draft.restoredRevision) throw invalid("这条任务来自已结束的工作稿");
  if (!run.providerTaskId || !mediaKind.safeParse(run.kind).success) throw invalid("没有可继续查询的百炼任务");
  if (run.status === "queued" || run.status === "running") return runView(run);
  const stage = z.object({ stage: z.string() }).safeParse(run.failureDetail);
  if (run.status !== "failed" || !stage.success || !["poll", "download"].includes(stage.data.stage)) throw invalid("此任务无法继续查询");
  await requireGenerationReady();
  await db.run.updateMany({ where: { id: run.id, status: "failed" }, data: {
    status: "queued", error: null, resumeCount: { increment: 1 }, nextPollAt: null,
  } });
  return runView(await db.run.findUniqueOrThrow({ where: { id: run.id } }));
});
api.post(`${prefix}/runs/:id/apply`, async (req) => {
  const run = await db.run.findFirst({ where: { id: pathId(req), draft: { ownerId: await owner(req), deletedAt: null } }, include: { draft: true } });
  if (!run) throw missing();
  if (run.baseRevision < run.draft.restoredRevision) throw invalid("这条任务来自已结束的工作稿");
  const media = mediaKind.safeParse(run.kind);
  const piStage = !media.success && isPiCandidate(run);
  const revision = req.body ? revisionSchema.parse(req.body).revision : (piStage ? run.draft.revision : run.baseRevision);
  const parsedResult = media.success ? undefined : resultSchema.parse(run.result);
  if (run.appliedRevision !== null && run.appliedRevision === run.draft.revision && !run.undoneAt) {
    return { ...draftView(run.draft), ...(media.success ? {} : { changed: parsedResult!.changed }) };
  }
  if (conversationInput.safeParse(run.input).data?.planExecution) throw invalid("请基于最新草稿重新确认计划");
  if (!media.success && !piStage && revision !== run.baseRevision &&
    !(run.undoneAt && run.appliedRevision !== null && revision === run.appliedRevision + 1)) throw conflict();
  if (run.draft.revision !== revision || (!media.success && run.appliedRevision !== null && !run.undoneAt)) throw conflict();
  if (run.status !== "succeeded") throw invalid("候选稿还未就绪");
  if (!media.success && !piStage && parsedResult?.superseded) throw conflict();
  const mediaId = media.success ? z.object({ mediaId: z.uuid() }).parse(run.result).mediaId : undefined;
  const current = draftSchema.parse(run.draft.data);
  if (media.success && media.data === "image" && mediaId && current.imageIds.includes(mediaId)) return draftView(run.draft);
  if (media.success && media.data === "image" && current.imageIds.length >= 9) throw invalid("每篇笔记最多选用 9 张配图");
  const patch = media.success
    ? (media.data === "cover" ? { coverId: mediaId } : media.data === "image" ? { imageIds: [...current.imageIds, mediaId!] } : { videoId: mediaId })
    : piStage ? resolvePiStagePatch(current, parsedResult!, run.baseRevision !== revision) : parsedResult!.patch;
  if (patch === null) throw conflict();
  if (!patch) throw invalid("这个结果没有可应用的修改");
  const data = draftSchema.parse({ ...current, ...patch });
  const changed = media.success ? null : changedFields(current, data);
  return db.$transaction(async (tx) => {
    await lockWorkingDraft(tx, run.draft);
    if (!media.success && parsedResult?.toolChecks && !await currentDependencies(tx, run.draftId, parsedResult.workspaceDependencies ?? [])) {
      throw invalid("引用资料已变化，请按最新资料重试。");
    }
    if (!media.success && !piStage && !run.undoneAt) {
      const newer = await tx.run.findMany({ where: { draftId: run.draftId, baseRevision: revision,
        submissionOrder: { gt: run.submissionOrder }, kind: { in: ["generate", "revise"] },
      }, select: { status: true, result: true, input: true } });
      if (newer.some((item) => !isPiCandidate(item) && !mediaOnly(item) && (item.status !== "succeeded" ||
        Object.keys(resultSchema.safeParse(item.result).data?.patch ?? {}).length))) throw conflict();
    }
    if (changed && changed.length === 0) {
      const draft = await tx.draft.findUniqueOrThrow({ where: { id: run.draftId } });
      if (draft.revision !== revision) throw conflict();
      await tx.run.update({ where: { id: run.id }, data: { appliedRevision: revision, undoData: Prisma.DbNull, undoneAt: null,
        result: { ...parsedResult!, changed, appliedBefore: undefined, appliedPatch: undefined } } });
      return { ...draftView(draft), changed };
    }
    const rows = await tx.draft.updateManyAndReturn({ where: { id: run.draftId, revision, deletedAt: null }, data: { data, revision: { increment: 1 } } });
    if (!rows[0]) throw conflict();
    await tx.run.update({ where: { id: run.id }, data: { appliedRevision: rows[0].revision, undoData: current, undoneAt: null,
      ...(changed ? { result: { ...parsedResult!, changed, ...(piStage ? {
        appliedBefore: Object.fromEntries(changed.map((field) => [field, current[field]])),
        appliedPatch: Object.fromEntries(changed.map((field) => [field, data[field]])),
      } : {}) } } : {}) } });
    return { ...draftView(rows[0]), ...(changed ? { changed } : {}) };
  });
});
api.post(`${prefix}/runs/:id/undo`, async (req) => {
  const run = await db.run.findFirst({ where: { id: pathId(req), draft: { ownerId: await owner(req), deletedAt: null } },
    include: { draft: { select: { restoredRevision: true } } } });
  if (!run) throw missing();
  if (run.baseRevision < run.draft.restoredRevision) throw invalid("这条任务来自已结束的工作稿");
  if (run.appliedRevision === null || run.undoneAt || !run.undoData ||
    resultSchema.safeParse(run.result).data?.changed?.length === 0) throw conflict();
  const revision = run.appliedRevision;
  return db.$transaction(async (tx) => {
    const rows = await tx.draft.updateManyAndReturn({
      where: { id: run.draftId, revision, deletedAt: null }, data: { data: draftSchema.parse(run.undoData), revision: { increment: 1 } },
    });
    if (!rows[0]) throw conflict();
    await tx.run.update({ where: { id: run.id }, data: { undoneAt: new Date() } });
    return draftView(rows[0]);
  });
});

const adoptMediaRequest = z.object({
  revision: z.number().int().nonnegative(),
  imageIds: z.array(z.uuid()).max(9).default([]),
  coverId: z.uuid().optional(),
}).refine((value) => value.imageIds.length > 0 || Boolean(value.coverId), "请至少选择一张图片");

api.post(`${prefix}/drafts/:id/adopt-media`, async (req) => {
  const draft = await ownedDraft(req);
  const input = adoptMediaRequest.parse(req.body);
  return db.$transaction(async (tx) => {
    const current = await lockWorkingDraft(tx, draft);
    if (current.revision !== input.revision) throw conflict();
    const fresh = await tx.draft.findUnique({ where: { id: draft.id, deletedAt: null }, select: { data: true } });
    if (!fresh) throw missing();
    const requestedIds = [...new Set([...input.imageIds, ...(input.coverId ? [input.coverId] : [])])];
    const mediaRows = await tx.media.findMany({
      where: { id: { in: requestedIds }, draftId: draft.id, mime: { startsWith: "image/" } },
      select: { id: true },
    });
    if (mediaRows.length !== requestedIds.length) throw invalid("部分图片尚未生成完成或不可用");
    const data = draftSchema.parse(fresh.data);
    const mergedImages = [...new Set([...data.imageIds, ...input.imageIds])];
    if (mergedImages.length > 9) throw invalid("配图最多只能保留 9 张，请先移除部分旧图后再试");
    const nextData = draftSchema.parse({
      ...data,
      imageIds: mergedImages,
      coverId: input.coverId ?? data.coverId,
    });
    const rows = await tx.draft.updateManyAndReturn({
      where: { id: draft.id, revision: current.revision, deletedAt: null },
      data: { revision: { increment: 1 }, data: nextData },
    });
    if (!rows[0]) throw conflict();
    await tx.run.updateMany({
      where: { id: { in: requestedIds }, draftId: draft.id, status: "succeeded" },
      data: { appliedRevision: rows[0].revision, undoneAt: null },
    });
    return draftView(rows[0]);
  });
});

api.get(`${prefix}/drafts/:id/checks`, async (req) => {
  const draft = await ownedDraft(req);
  return { revision: draft.revision, ...checks(draftSchema.parse(draft.data)) };
});
api.post(`${prefix}/drafts/:id/finalizations`, async (req, reply) => {
  const draft = await ownedDraft(req);
  const { revision, noteKind } = revisionSchema.extend({ noteKind: z.enum(["image", "video"]).optional() }).parse(req.body);
  const output = await db.$transaction(async (tx) => {
    // Serialize snapshot inserts so a publisher cursor cannot skip a later commit.
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(1499255190)`;
    await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draft.id}::uuid FOR UPDATE`;
    const fresh = await tx.draft.findUnique({ where: { id: draft.id, deletedAt: null } });
    if (!fresh) throw missing();
    const data = draftSchema.parse(fresh.data);
    const both = Boolean(data.imageIds.length && data.videoId);
    const kind = both ? noteKind : data.videoId ? "video" : "image";
    if (both && !kind) throw invalid("请选择图文或视频后再定稿");
    const previous = await tx.finalization.findUnique({ where: { draftId_revision: { draftId: draft.id, revision } } });
    if (previous && (!noteKind || finalView(previous).noteKind === noteKind)) return { snapshot: previous, revision: fresh.revision, created: false };
    if (fresh.revision !== revision) {
      const repeat = both && data.publishKind === kind && fresh.revision === revision + 1
        ? await tx.finalization.findUnique({ where: { draftId_revision: { draftId: draft.id, revision: fresh.revision } } }) : null;
      if (repeat && finalView(repeat).noteKind === kind) return { snapshot: repeat, revision: fresh.revision, created: false };
      throw conflict();
    }
    if (checks(data).errors.length) throw invalid("请填写标题和正文");
    let target = revision;
    if (both && data.publishKind !== kind) {
      const saved = await tx.draft.updateMany({ where: { id: draft.id, revision, deletedAt: null }, data: {
        revision: { increment: 1 }, data: { ...data, publishKind: kind },
      } });
      if (!saved.count) throw conflict();
      target++;
    }
    const snapshot = await tx.finalization.upsert({
      where: { draftId_revision: { draftId: draft.id, revision: target } }, update: {},
      create: { draftId: draft.id, ownerId: draft.ownerId, revision: target, title: data.title.trim(), body: data.body.trim(),
        tags: data.tags, coverId: data.coverId, videoId: kind === "video" ? data.videoId : null,
        imageIds: kind === "image" ? data.imageIds : [] },
    });
    return { snapshot, revision: target, created: true };
  });
  return reply.code(output.created ? 201 : 200).send(finalView(output.snapshot));
});
api.get(`${prefix}/finalizations`, async (req) => {
  publisher(req);
  const { cursor, limit } = z.object({
    cursor: z.string().regex(/^\d{1,18}$/).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
  }).parse(req.query);
  const items = await db.finalization.findMany({
    where: cursor ? { position: { gt: BigInt(cursor) } } : undefined,
    orderBy: { position: "asc" }, take: limit + 1,
  });
  const page = items.slice(0, limit);
  return {
    items: page.map(finalView), hasMore: items.length > limit,
    nextCursor: page.length ? String(page.at(-1)!.position) : cursor ?? null,
  };
});
api.get(`${prefix}/finalizations/:id`, async (req) => {
  publisher(req);
  const final = await db.finalization.findUnique({ where: { id: pathId(req) } });
  if (!final) throw missing();
  return finalView(final);
});
api.get(`${prefix}/finalizations/:id/cover`, async (req, reply) => {
  publisher(req);
  const final = await db.finalization.findUnique({ where: { id: pathId(req) }, include: { cover: true } });
  if (!final?.cover) throw missing();
  return sendMedia(reply, final.cover, req.headers.range);
});
api.get(`${prefix}/finalizations/:id/video`, async (req, reply) => {
  publisher(req);
  const final = await db.finalization.findUnique({ where: { id: pathId(req) }, include: { video: true } });
  if (!final?.video) throw missing();
  return sendMedia(reply, final.video, req.headers.range);
});
api.get(`${prefix}/finalizations/:id/images/:imageId`, async (req, reply) => {
  publisher(req);
  const { id, imageId } = idSchema.extend({ imageId: z.uuid() }).parse(req.params);
  const final = await db.finalization.findUnique({ where: { id } });
  if (!final?.imageIds.includes(imageId)) throw missing();
  const image = await db.media.findFirst({ where: { id: imageId, draftId: final.draftId, mime: { startsWith: "image/" } } });
  if (!image) throw missing();
  return sendMedia(reply, image, req.headers.range);
});
api.get(`${prefix}/my/finalizations`, async (req) => {
  const ownerId = await owner(req);
  const items = await db.finalization.findMany({
    where: { ownerId },
    orderBy: { finalizedAt: "desc" },
    take: 100,
  });
  const draftIds = [...new Set(items.map((item) => item.draftId))];
  const drafts = draftIds.length
    ? await db.draft.findMany({ where: { id: { in: draftIds }, ownerId }, select: { id: true, name: true, deletedAt: true } })
    : [];
  const draftMap = new Map(drafts.map((d) => [d.id, d]));
  return {
    items: items.map((item) => {
      const linked = draftMap.get(item.draftId);
      return {
        ...finalView(item),
        createdAt: item.finalizedAt.toISOString(),
        draftName: linked?.name ?? null,
        draftDeleted: !linked || Boolean(linked.deletedAt),
        coverUrl: item.coverId ? `/api${prefix}/my/finalizations/${item.id}/cover` : null,
        videoUrl: item.videoId ? `/api${prefix}/my/finalizations/${item.id}/video` : null,
        imageUrls: item.imageIds.map((imageId) => `/api${prefix}/my/finalizations/${item.id}/images/${imageId}`),
      };
    }),
  };
});
api.get(`${prefix}/my/finalizations/:id/cover`, async (req, reply) => {
  const ownerId = await owner(req);
  const final = await db.finalization.findFirst({ where: { id: pathId(req), ownerId }, include: { cover: true } });
  if (!final?.cover) throw missing();
  return sendMedia(reply, final.cover, req.headers.range);
});
api.get(`${prefix}/my/finalizations/:id/video`, async (req, reply) => {
  const ownerId = await owner(req);
  const final = await db.finalization.findFirst({ where: { id: pathId(req), ownerId }, include: { video: true } });
  if (!final?.video) throw missing();
  return sendMedia(reply, final.video, req.headers.range);
});
api.get(`${prefix}/my/finalizations/:id/images/:imageId`, async (req, reply) => {
  const ownerId = await owner(req);
  const { id, imageId } = idSchema.extend({ imageId: z.uuid() }).parse(req.params);
  const final = await db.finalization.findFirst({ where: { id, ownerId } });
  if (!final?.imageIds.includes(imageId)) throw missing();
  const image = await db.media.findFirst({ where: { id: imageId, draftId: final.draftId, mime: { startsWith: "image/" } } });
  if (!image) throw missing();
  return sendMedia(reply, image, req.headers.range);
});
api.delete(`${prefix}/my/finalizations/:id`, async (req, reply) => {
  const ownerId = await owner(req);
  const id = pathId(req);
  const removed = await db.finalization.deleteMany({ where: { id, ownerId } });
  if (!removed.count) throw missing();
  return reply.code(200).send({ deleted: true, id });
});
await api.listen({ port: env.port, host: env.host });
for (const event of ["SIGINT", "SIGTERM"] as const) {
  process.once(event, async () => {
    await api.close();
    await db.$disconnect();
  });
}
