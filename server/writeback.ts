import type { Prisma, Run } from "@prisma/client";
import { db } from "./config.js";
import { changedFields, draftSchema, jobInputSchema, plannedMedia, resultSchema, type Result } from "./domain.js";
import { cleanUncommittedObjects, currentDependencies, publishArtifacts } from "./workspace.js";

export const awaitingWriteback = "awaiting-writeback";
const writingKinds = ["generate", "revise"];

function planExecution(run: Pick<Run, "input">) {
  return (run.input as { planExecution?: boolean } | null)?.planExecution === true;
}

export function mediaOnly(run: Pick<Run, "input">) {
  return (run.input as { mediaOnly?: boolean } | null)?.mediaOnly === true;
}

export function isPiCandidate(run: Pick<Run, "input">) {
  return (run.input as { piStage?: boolean } | null)?.piStage === true;
}

function patchOf(run: Pick<Run, "result">) {
  const patch = resultSchema.safeParse(run.result).data?.patch;
  return patch && Object.keys(patch).length ? patch : undefined;
}

async function lockDraft(tx: Prisma.TransactionClient, draftId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;
  return tx.draft.findUnique({ where: { id: draftId } });
}

async function keepCandidate(tx: Prisma.TransactionClient, run: Run, superseded: boolean) {
  const result = resultSchema.parse(run.result);
  await tx.run.update({ where: { id: run.id }, data: {
    status: planExecution(run) || result.artifactConflict || result.artifactError ? "failed" : "succeeded",
    result: superseded ? { ...result, superseded: true } : result,
    error: result.artifactConflict ? "工作区资料或目标已变化，产物候选已保留，请重试。"
      : result.artifactError ?? (!planExecution(run) ? null : superseded
      ? "已有更新的创作请求，计划文案和媒体步骤已暂停，请重新讨论计划。"
      : "工作稿在执行期间已变化，请基于最新稿重新讨论计划。"),
  } });
}

async function reconcile(tx: Prisma.TransactionClient, draft: NonNullable<Awaited<ReturnType<typeof lockDraft>>>) {
  if (draft.deletedAt) return;
  const candidates = await tx.run.findMany({ where: { draftId: draft.id, status: awaitingWriteback },
    orderBy: { submissionOrder: "desc" },
  });
  if (!candidates.length) return;
  const current = candidates.filter((run) => run.baseRevision === draft.revision);
  for (const candidate of candidates) {
    if (candidate.baseRevision === draft.revision) continue;
    const newerWrite = await tx.run.findFirst({ where: { draftId: draft.id, baseRevision: candidate.baseRevision,
      submissionOrder: { gt: candidate.submissionOrder }, kind: { in: writingKinds }, appliedRevision: { not: null },
    }, select: { id: true } });
    await keepCandidate(tx, candidate, Boolean(newerWrite));
  }
  if (!current.length) return;

  const oldest = current[current.length - 1].submissionOrder;
  const turns = await tx.run.findMany({ where: { draftId: draft.id, baseRevision: draft.revision,
    kind: { in: writingKinds }, submissionOrder: { gte: oldest },
  }, orderBy: { submissionOrder: "desc" } });
  // A completed reply without a patch can neither apply nor supersede other work.
  const latest = turns.find((run) => {
    const input = jobInputSchema.safeParse(run.input).data;
    return !isPiCandidate(run) && !mediaOnly(run) && input?.planWritesNote !== false &&
      (run.status === "succeeded" || run.status === "awaiting-writeback" ? patchOf(run) : true);
  });
  if (!latest || latest.status === "queued" || latest.status === "running") return;

  for (const candidate of current) {
    if (candidate.id !== latest.id) await keepCandidate(tx, candidate, true);
  }
  if (latest.status !== awaitingWriteback) return;
  const result = resultSchema.parse(latest.result);
  if (result.toolChecks && !await currentDependencies(tx, draft.id, result.workspaceDependencies ?? [])) {
    await tx.run.update({ where: { id: latest.id }, data: { status: "failed",
      result: { ...result, sourceConflict: true }, error: "引用资料已变化，候选稿已保留，请按最新资料重试。" } });
    return;
  }
  const plan = planExecution(latest) ? await tx.creationPlan.findUnique({ where: { draftId: draft.id } }) : null;
  if (planExecution(latest) && plan?.executionRunId !== latest.id) {
    await keepCandidate(tx, latest, true);
    return;
  }
  const before = draftSchema.parse(draft.data);
  const data = draftSchema.parse({ ...before, ...result.patch });
  const changed = changedFields(before, data);
  const revision = draft.revision + (changed.length ? 1 : 0);
  if (changed.length) await tx.draft.update({ where: { id: draft.id }, data: { data, revision } });
  const artifactFailure = result.artifactConflict ? "工作区资料或目标已变化，产物候选已保留。"
    : result.artifactError ?? null;
  await tx.run.update({ where: { id: latest.id }, data: {
    status: artifactFailure ? "failed" : "succeeded", error: artifactFailure, appliedRevision: revision, result: { ...result, changed },
    ...(changed.length ? { undoData: before } : {}),
  } });
  if (plan && !artifactFailure) await tx.creationPlan.updateMany({ where: { draftId: draft.id, executionRunId: latest.id }, data: {
    executionRunId: null, enabled: plannedMedia.parse(plan.media).length > 0 && plan.enabled, version: { increment: 1 },
  } });
}

export async function completeWriting(run: Run, result: Result) {
  const staged: string[] = [];
  try { await db.$transaction(async (tx) => {
    const draft = await lockDraft(tx, run.draftId);
    if (!draft || draft.deletedAt || draft.restoredRevision > run.baseRevision) return;
    const current = await tx.run.findUnique({ where: { id: run.id }, select: { status: true } });
    if (current?.status !== "running") return;
    const input = jobInputSchema.parse(run.input);
    result = await publishArtifacts(tx, draft.id, run.baseRevision, run.id, input, result, staged);
    if (result.toolChecks && result.publishedArtifacts?.length && result.workspaceDependencies) {
      result.workspaceDependencies = result.workspaceDependencies.map((ref) =>
        result.publishedArtifacts?.find(({ fileId }) => fileId === ref.fileId) ?? ref);
    }
    const hasPatch = Boolean(result.patch && Object.keys(result.patch).length);
    const noPlanOutput = !hasPatch && planExecution(run) &&
      (input.planWritesNote !== false || !result.publishedArtifacts?.length);
    const { artifacts, ...publicResult } = result;
    const changed = await tx.run.updateMany({ where: { id: run.id, status: "running" }, data: {
      status: hasPatch ? awaitingWriteback : noPlanOutput || result.artifactConflict || result.artifactError ? "failed" : "succeeded",
      result: artifacts ? { ...publicResult, artifacts } : publicResult,
      error: result.artifactConflict ? "工作区资料或目标已变化，产物候选已保留，请重试。"
        : result.artifactError ?? (noPlanOutput ? "计划中的交付物未完成，请重新讨论计划。" : null),
    } });
    if (changed.count && planExecution(run) && !hasPatch && !noPlanOutput && !result.artifactConflict) {
      const plan = await tx.creationPlan.findUnique({ where: { draftId: draft.id } });
      if (plan?.executionRunId === run.id) await tx.creationPlan.update({ where: { draftId: draft.id }, data: {
        executionRunId: null, enabled: plannedMedia.parse(plan.media).length > 0 && plan.enabled, version: { increment: 1 },
      } });
    }
    if (changed.count) await reconcile(tx, draft);
  }, { timeout: 30_000 }); }
  catch (error) {
    await cleanUncommittedObjects(db, staged);
    throw error;
  }
}

export async function failRun(run: Pick<Run, "id" | "draftId" | "kind">, error: string, failureDetail?: Prisma.InputJsonValue) {
  if (!writingKinds.includes(run.kind)) {
    await db.run.updateMany({ where: { id: run.id, status: { in: ["queued", "running", "submitting"] } },
      data: { status: "failed", error, failureDetail },
    });
    return;
  }
  await db.$transaction(async (tx) => {
    const draft = await lockDraft(tx, run.draftId);
    const failed = await tx.run.updateMany({ where: { id: run.id, status: { in: ["queued", "running"] } },
      data: { status: "failed", error, failureDetail },
    });
    if (draft && failed.count) await reconcile(tx, draft);
  });
}

export async function reconcilePendingDrafts() {
  const drafts = await db.draft.findMany({ where: { deletedAt: null, runs: { some: { status: awaitingWriteback } } },
    select: { id: true }, orderBy: { id: "asc" },
  });
  for (const { id } of drafts) {
    await db.$transaction(async (tx) => {
      const draft = await lockDraft(tx, id);
      if (draft) await reconcile(tx, draft);
    });
  }
}
