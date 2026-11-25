import type { MediaBrief, Prisma, Run } from "@prisma/client";
import { z } from "zod";
import { db } from "./config.js";
import { draftSchema } from "./domain.js";
import { briefKind, briefView, mediaMessages, mediaNoteFingerprint, planMedia } from "./media-brief.js";
import type { Resolved } from "./model-settings.js";

export const mediaPreparationKind = "media-prepare";
export const preparing = ["queued", "running"];

export const expectedBriefSchema = z.object({ id: z.uuid(), version: z.number().int(), runId: z.uuid().nullable() });
export const preparationInput = z.object({
  kind: briefKind,
  note: z.object({ title: z.string(), body: z.string() }),
  messages: mediaMessages,
  expectedBrief: expectedBriefSchema.nullable(),
  briefId: z.uuid(),
  sourceRunId: z.uuid().optional(),
  requiresAppliedWriting: z.boolean().optional(),
});
export type PreparationInput = z.infer<typeof preparationInput>;

export function briefIdentity(brief: MediaBrief | null) {
  if (!brief) return null;
  const { id, version, runId } = brief;
  return { id, version, runId };
}

export function sameBrief(before: PreparationInput["expectedBrief"], after: MediaBrief | null) {
  return before && after ? before.id === after.id && before.version === after.version && before.runId === after.runId : !before && !after;
}

export function activeMediaPreparation(tx: Prisma.TransactionClient, draftId: string) {
  return tx.run.findFirst({ where: { draftId, kind: mediaPreparationKind, status: { in: preparing } }, select: { id: true } });
}

export async function completeMediaPreparation(run: Run, profile?: Resolved) {
  const input = preparationInput.parse(run.input);
  const planned = await planMedia(input.kind, input.messages, input.note, profile);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${run.draftId}::uuid FOR UPDATE`;
    const draft = await tx.draft.findUnique({ where: { id: run.draftId } });
    const current = await tx.run.findUnique({ where: { id: run.id }, select: { status: true } });
    if (current?.status !== "running") return;
    if (!draft || draft.deletedAt || draft.restoredRevision > run.baseRevision) {
      await tx.run.update({ where: { id: run.id }, data: { status: "cancelled" } });
      return;
    }
    const previous = await tx.mediaBrief.findUnique({ where: { draftId: draft.id } });
    if (!sameBrief(input.expectedBrief, previous)) {
      await tx.run.update({ where: { id: run.id }, data: { status: "cancelled" } });
      return;
    }
    const data = {
      ...planned, confirmationOnly: true, noteFingerprint: mediaNoteFingerprint(input.note),
      ...(input.sourceRunId ? { sourceRunId: input.sourceRunId, requiresAppliedWriting: input.requiresAppliedWriting } : {}),
    };
    const note = draftSchema.parse(draft.data);
    const candidate = { id: input.briefId, draftId: draft.id, version: (previous?.version ?? 0) + 1, runId: null, data };
    const brief = briefView(candidate, note);
    if (!brief.stale) {
      if (previous) await tx.mediaBrief.update({ where: { draftId: draft.id }, data: candidate });
      else await tx.mediaBrief.create({ data: candidate });
    }
    await tx.run.update({ where: { id: run.id }, data: {
      status: "succeeded", error: null, result: { preparation: { state: brief.stale ? "stale" : "applied", brief } },
    } });
  });
}
