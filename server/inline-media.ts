import { setTimeout as delay } from "node:timers/promises";
import { downloadResult, getBailian, MediaFailure, startBailian } from "./bailian.js";
import { db } from "./config.js";
import { mediaInput, mediaKind } from "./domain.js";
import { logGeneration } from "./generation-log.js";
import { firstFrame, storeMedia } from "./media.js";
import { credentials, hasMasterKey } from "./model-settings.js";
import { failRun } from "./writeback.js";

const inFlight = new Set<string>();
const pollIntervalMs = 4500;
const maxPollAttempts = 40;

async function executeBailianImageRun(runId: string): Promise<void> {
  const run = await db.run.findFirst({
    where: { id: runId, draft: { deletedAt: null } },
    include: { profile: true },
  });
  if (!run || run.status === "succeeded" || run.status === "cancelled") return;
  const kind = mediaKind.safeParse(run.kind);
  if (!kind.success || (kind.data !== "cover" && kind.data !== "image")) return;

  if (!run.profile || !hasMasterKey()) {
    await failRun(run, "图像生成模型配置不可用，请联系管理员", { stage: "provider" });
    return;
  }

  let taskId = run.providerTaskId;
  try {
    const profile = credentials(run.profile);
    const input = mediaInput.parse(run.input);
    const hadTask = Boolean(taskId);

    if (!taskId) {
      if (run.status === "submitting") {
        await failRun(run, "百炼受理状态未知，请重新发起生图。", { stage: "unknown" });
        return;
      }
      const cover = input.sourceCoverId ? await db.media.findFirst({
        where: { id: input.sourceCoverId, draftId: run.draftId, mime: { startsWith: "image/" } },
      }) : null;
      const frame = cover ? await firstFrame(cover.objectKey, cover.mime) : undefined;
      const claim = await db.run.updateMany({
        where: { id: run.id, status: "queued", draft: { deletedAt: null, restoredRevision: { lte: run.baseRevision } } },
        data: { status: "submitting" },
      });
      if (!claim.count) return;

      const start = Date.now();
      const started = await startBailian(profile, kind.data, input, frame);
      taskId = started.taskId;
      logGeneration("generation.media", {
        stage: "provider-submit",
        providerStatus: "accepted",
        providerHttpStatus: started.status,
        providerRequestId: started.requestId,
        elapsedMs: Date.now() - start,
      });
      await db.run.update({
        where: { id: run.id },
        data: { providerTaskId: taskId, status: "running", error: null, nextPollAt: new Date(Date.now() + pollIntervalMs) },
      });
    } else {
      await db.run.updateMany({
        where: { id: run.id, status: "queued" },
        data: { status: "running", error: null, nextPollAt: new Date(Date.now() + pollIntervalMs) },
      });
    }

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      if (!hadTask || attempt > 0) {
        await delay(pollIntervalMs);
      }
      const current = await db.run.findFirst({
        where: { id: run.id, draft: { deletedAt: null } },
        select: { status: true },
      });
      if (!current || current.status !== "running") return;

      const start = Date.now();
      const output = await getBailian(profile, taskId);
      const providerStatus = output.status && ["RUNNING", "PENDING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"].includes(output.status)
        ? output.status : "unknown";
      logGeneration("generation.media", {
        stage: "provider-poll",
        providerStatus,
        providerHttpStatus: output.statusCode,
        providerRequestId: output.requestId,
        elapsedMs: Date.now() - start,
      });

      if (output.status === "RUNNING" || output.status === "PENDING") {
        await db.run.updateMany({
          where: { id: run.id, status: "running" },
          data: { nextPollAt: new Date(Date.now() + pollIntervalMs) },
        });
        continue;
      }
      if (output.status !== "SUCCEEDED" || !output.url) {
        throw new MediaFailure("百炼未生成可用图片，请调整画面描述后重试。", "provider", output.statusCode, output.code, output.requestId);
      }

      const { bytes, mime } = await downloadResult(output.url, true)
        .catch(() => { throw new MediaFailure("图片已生成，但暂时取不回文件，可点击继续取回。", "download"); });
      await storeMedia(run.id, mime, bytes, true)
        .catch(() => { throw new MediaFailure("图片已生成，但保存文件失败，可点击继续取回。", "download"); });

      await db.$transaction([
        db.media.upsert({ where: { id: run.id }, update: {}, create: { id: run.id, draftId: run.draftId, objectKey: run.id, mime } }),
        db.run.update({
          where: { id: run.id },
          data: { status: "succeeded", result: { mediaId: run.id }, error: null, nextPollAt: null },
        }),
      ]);
      return;
    }

    throw new MediaFailure("百炼生图超时，可点击继续查询进度。", "poll");
  } catch (error) {
    const mediaError = error instanceof MediaFailure ? error : undefined;
    const feedback = mediaError?.message ?? (error instanceof Error ? error.message : "图片生成失败，请稍后重试。");
    await failRun(run, feedback, mediaError?.detail ?? { stage: taskId ? "poll" : "provider" });
  }
}

export function runBailianImageInline(runId: string): void {
  if (inFlight.has(runId)) return;
  inFlight.add(runId);
  void executeBailianImageRun(runId).finally(() => {
    inFlight.delete(runId);
  });
}
