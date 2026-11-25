import { DelayedError, Queue, Worker, type Job } from "bullmq";
import type { ModelProfile, Run } from "@prisma/client";
import { downloadResult, getBailian, MediaFailure, startBailian } from "./bailian.js";
import { db } from "./config.js";
import { jobInputSchema, mediaInput, mediaKind, submissionSchema, type MediaKind } from "./domain.js";
import { firstFrame, storeMedia } from "./media.js";
import { ContextLimitError, generate, ModelOutputError } from "./model.js";
import { completeMediaPreparation, mediaPreparationKind } from "./media-preparation.js";
import { credentials, type Resolved } from "./model-settings.js";
import { awaitingWriteback, completeWriting, failRun, reconcilePendingDrafts } from "./writeback.js";
import { generationConnection, generationQueueName, generationQueuePrefix, publishWorkerHeartbeat } from "./generation-health.js";
import { logGeneration, withGenerationLog } from "./generation-log.js";
import { StarToolError } from "./star-tools.js";
import { executeAnalyzeRun } from "./reference-import.js";

const queue = new Queue<{ runId: string }>(generationQueueName, {
  prefix: generationQueuePrefix,
  connection: { ...generationConnection, maxRetriesPerRequest: 1, enableOfflineQueue: false,
    connectTimeout: 3000, commandTimeout: 3000 },
  defaultJobOptions: {
    attempts: 2, backoff: { type: "exponential", delay: 2500 },
    removeOnComplete: { age: 86_400 }, removeOnFail: { age: 86_400 },
  },
});
const failure = "生成暂时失败。请检查连接或稍后重试。";

async function mediaStep(run: Run, kind: MediaKind, profile?: Resolved) {
  if (!profile) throw new Error("媒体模型配置缺失");
  const input = mediaInput.parse(run.input);
  if (!run.providerTaskId) {
    if (run.status === "submitting") {
      await db.run.update({ where: { id: run.id }, data: { status: "failed", error: "百炼受理状态未知。请先查看百炼任务记录。", failureDetail: { stage: "unknown" } } });
      return false;
    }
    const cover = input.sourceCoverId ? await db.media.findFirst({
      where: { id: input.sourceCoverId, draftId: run.draftId, mime: { startsWith: "image/" } },
    }) : null;
    if (kind === "imageToVideo" && !cover) throw new Error("首帧封面不可用");
    const frame = cover ? await firstFrame(cover.objectKey, cover.mime) : undefined;
    const claim = await db.run.updateMany({ where: { id: run.id, status: "queued",
      draft: { deletedAt: null, restoredRevision: { lte: run.baseRevision } } }, data: { status: "submitting" } });
    if (!claim.count) return false;
    const start = Date.now();
    const { taskId, status, requestId } = await startBailian(profile, kind, input, frame);
    logGeneration("generation.media", { stage: "provider-submit", providerStatus: "accepted",
      providerHttpStatus: status, providerRequestId: requestId, elapsedMs: Date.now() - start });
    await db.run.update({ where: { id: run.id }, data: { providerTaskId: taskId, status: "running" } });
    return true;
  }
  const start = Date.now();
  const output = await getBailian(profile, run.providerTaskId);
  const providerStatus = output.status && ["RUNNING", "PENDING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"].includes(output.status)
    ? output.status : "unknown";
  logGeneration("generation.media", { stage: "provider-poll", providerStatus, providerHttpStatus: output.statusCode,
    providerRequestId: output.requestId, elapsedMs: Date.now() - start });
  if (output.status === "RUNNING" || output.status === "PENDING") return true;
  if (output.status !== "SUCCEEDED" || !output.url) {
    throw new MediaFailure("百炼未生成可用媒体，请检查需求与任务记录。", "provider", output.statusCode, output.code, output.requestId);
  }
  const { bytes, mime } = await downloadResult(output.url, kind === "cover" || kind === "image")
    .catch(() => { throw new MediaFailure("生成已完成，但暂时取不回文件。可以继续取回。", "download"); });
  await storeMedia(run.id, mime, bytes, true)
    .catch(() => { throw new MediaFailure("生成已完成，但暂时无法保存文件。可以继续取回。", "download"); });
  await db.$transaction([
    db.media.upsert({ where: { id: run.id }, update: {}, create: { id: run.id, draftId: run.draftId, objectKey: run.id, mime } }),
    db.run.update({ where: { id: run.id }, data: {
      status: "succeeded", result: { mediaId: run.id }, error: null, nextPollAt: null,
    } }),
  ]);
  return false;
}

async function processRun(job: Job<{ runId: string }>, run: Run & { profile: ModelProfile | null }, token?: string) {
  const { id: runId } = run;
  const media = mediaKind.safeParse(run.kind);
  const started = Date.now();
  let stage = media.success ? "media" : run.kind === mediaPreparationKind ? "prepare" : "generation";
  let outcome = "completed";
  let errorFields: { errorType?: string; fields?: string[]; failureStage?: string;
    providerHttpStatus?: number; providerRequestId?: string } = {};
  try {
    const profile = run.profile ? credentials(run.profile) : undefined;
    if (media.success) {
      if (await mediaStep(run, media.data, profile)) {
        const next = Date.now() + (media.data === "cover" || media.data === "image" ? 5000 : 15000);
        await db.run.update({ where: { id: runId }, data: { nextPollAt: new Date(next) } });
        if (!token) throw new Error("队列锁已失效");
        await job.moveToDelayed(next, token);
        throw new DelayedError();
      }
      return;
    }
    const claim = await db.run.updateMany({
      where: { id: runId, status: { in: ["queued", "running"] } }, data: { status: "running", toolProgress: [] },
    });
    if (!claim.count) { outcome = "skipped"; return; }
    if (run.kind === mediaPreparationKind) {
      await completeMediaPreparation(run, profile);
      return;
    }
    const kind = submissionSchema.shape.kind.parse(run.kind);
    if (kind === "analyze") {
      await executeAnalyzeRun(run);
      return;
    }
    const input = jobInputSchema.parse(run.input);
    const draft = profile?.toolsVerified ? await db.draft.findUnique({ where: { id: run.draftId, deletedAt: null }, select: { ownerId: true } }) : null;
    const result = await generate(kind, input, run.prompt ?? undefined, profile, draft ? {
      draftId: run.draftId, ownerId: draft.ownerId, baseRevision: run.baseRevision,
      progress: async (toolProgress) => {
        await db.run.updateMany({ where: { id: runId, status: "running" }, data: { toolProgress } });
      },
    } : undefined);
    stage = "writeback";
    if (kind === "generate" || kind === "revise") { await completeWriting(run, result); return; }
    await db.run.updateMany({
      where: { id: runId, status: "running" }, data: { status: "succeeded", result, error: null },
    });
  } catch (error) {
    if (error instanceof DelayedError) { outcome = "delayed"; throw error; }
    const formatError = error instanceof ModelOutputError ? error : undefined;
    const mediaError = error instanceof MediaFailure ? error : undefined;
    const contextError = error instanceof ContextLimitError ? error : undefined;
    const toolError = error instanceof StarToolError ? error : undefined;
    const feedback = toolError?.message ?? mediaError?.message ?? formatError?.message ?? contextError?.message ??
      (run.kind === mediaPreparationKind ? "暂时无法整理媒体需求，请重试。" : failure);
    const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const terminalMedia = mediaError && ["rejected", "unknown", "provider"].includes(mediaError.stage);
    const terminal = terminalMedia || Boolean(contextError || toolError);
    outcome = exhausted || terminal ? "failed" : "retry";
    errorFields = {
      errorType: formatError ? "format" : mediaError ? "media" : contextError ? "context-limit" : "unexpected",
      fields: formatError?.fields, failureStage: mediaError?.stage,
      providerHttpStatus: mediaError?.status, providerRequestId: mediaError?.requestId,
    };
    if (exhausted || terminal) await failRun(run, feedback, mediaError?.detail ?? (contextError ? { stage: "context-limit" } : undefined));
    if (terminal) return;
    throw new Error(feedback, { cause: error });
  } finally {
    logGeneration("generation.attempt", { stage, outcome, elapsedMs: Date.now() - started,
      queueWaitMs: run.status === "queued" ? Math.max(0, started - run.updatedAt.getTime()) : undefined, ...errorFields });
  }
}

const worker = new Worker<{ runId: string }>(generationQueueName, async (job, token) => {
  const { runId } = job.data;
  const run = await db.run.findFirst({ where: { id: runId, draft: { deletedAt: null } }, include: { profile: true } });
  if (!run || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled" || run.status === awaitingWriteback) return;
  return withGenerationLog({ runId, jobId: job.id, draftId: run.draftId, profileId: run.profileId,
    kind: run.kind, attempt: job.attemptsMade + 1 }, () => processRun(job, run, token));
}, { prefix: generationQueuePrefix, connection: { ...generationConnection, maxRetriesPerRequest: null }, concurrency: 3 });

let lastErrorLog = 0;
function logDependency() {
  if (Date.now() - lastErrorLog < 10_000) return;
  lastErrorLog = Date.now();
  logGeneration("generation.dependency", { stage: "queue-dispatch", outcome: "failed" });
}
queue.on("error", logDependency);
worker.on("error", logDependency);

let dispatch: Promise<void> | undefined;
async function dispatchPending() {
  await reconcilePendingDrafts();
  const stale = new Date(Date.now() - 180_000);
  const jobs = await db.run.findMany({
    where: { draft: { deletedAt: null }, OR: [
      { status: "queued" }, { status: { in: ["running", "submitting"] }, updatedAt: { lt: stale } },
      { status: "running", nextPollAt: { lt: new Date(Date.now() - 10000) } },
    ] },
    orderBy: { updatedAt: "asc" }, select: { id: true, draftId: true, kind: true, resumeCount: true }, take: 60,
  });
  for (const run of jobs) {
    const { id, resumeCount } = run;
    const jobId = resumeCount ? `${id}-resume-${resumeCount}` : id;
    const job = await queue.getJob(jobId);
    if (!job) await queue.add("generate", { runId: id }, { jobId });
    else if (["failed", "completed"].includes(await job.getState())) await failRun(run, failure);
  }
}

function tick() {
  if (!dispatch) dispatch = (async () => {
    await dispatchPending();
    if (worker.isRunning() && !worker.isPaused() && (await worker.client).status === "ready") {
      await publishWorkerHeartbeat(queue);
    }
  })().catch(logDependency).finally(() => { dispatch = undefined; });
}
const timer = setInterval(tick, 1500);
tick();
for (const event of ["SIGINT", "SIGTERM"] as const) {
  process.once(event, async () => {
    clearInterval(timer);
    await dispatch;
    await worker.close();
    await queue.close();
    await db.$disconnect();
  });
}
