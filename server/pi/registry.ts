import { PiEventLog } from "./events.js";
import { generateImages, parseXhsNote, readNote, renderCards, stageNote } from "./internal.js";
import { DraftSession, type RequestOutcome } from "./session.js";
import { draftPaths } from "./workspace.js";
import { env } from "../config.js";

export type DraftRef = { draftId: string; ownerId: string };

type Entry = { session: DraftSession; log: PiEventLog; touchedAt: number; closing?: Promise<void> };

const entries = new Map<string, Entry>();

export function entryOf(draftId: string, ownerId?: string) {
  const entry = entries.get(draftId);
  if (entry && ownerId !== undefined && entry.session.ownerId !== ownerId) {
    throw Object.assign(new Error("草稿会话归属不匹配"), { statusCode: 404, code: "SESSION_NOT_FOUND" });
  }
  return entry;
}

async function reportOutcome(ref: DraftRef, outcome: RequestOutcome) {
  const base = (process.env.PI_INTERNAL_URL ?? `http://127.0.0.1:${env.port}`).replace(/\/$/, "");
  const response = await fetch(`${base}/internal/pi/drafts/${ref.draftId}/request-outcome`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pi-runner-token": env.piRunnerToken },
    body: JSON.stringify({ ownerId: ref.ownerId, ...outcome }),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok && response.status !== 404) throw new Error("请求状态写回失败");
}

/**
 * 一个草稿一个原生会话驱动器。
 *
 * 工作区锁的粒度就是这里：同一 draftId 同时只有一个 DraftSession 在跑，
 * 因此文件工具可以直接沿用 Pi 的原生语义。
 */
export function ensureSession(ref: DraftRef) {
  const existing = entryOf(ref.draftId, ref.ownerId);
  if (existing) {
    existing.touchedAt = Date.now();
    return existing;
  }
  const paths = draftPaths(ref.draftId);
  const log = new PiEventLog(paths.events);
  const session = new DraftSession({
    draftId: ref.draftId,
    ownerId: ref.ownerId,
    log,
    agentDir: env.piAgentDir,
    reportOutcome: (outcome) => reportOutcome(ref, outcome),
    bridge: {
      draftId: ref.draftId,
      readNote: () => readNote(ref.ownerId, ref.draftId),
      stageNote: (input) => stageNote(ref.ownerId, ref.draftId, input),
      renderCards: (input) => renderCards(ref.ownerId, ref.draftId, input),
      generateImages: (input) => generateImages(ref.ownerId, ref.draftId, input),
      parseXhsNote: (input) => parseXhsNote(ref.ownerId, ref.draftId, input),
    },
  });
  const entry = { session, log, touchedAt: Date.now() };
  entries.set(ref.draftId, entry);
  return entry;
}

export async function closeSession(draftId: string, ownerId?: string) {
  const entry = entryOf(draftId, ownerId);
  if (!entry) return;
  entry.closing ??= (async () => {
    entry.log.closeStreams();
    await entry.session.revoke();
    await entry.log.flush();
  })().finally(() => {
    if (entries.get(draftId) === entry) entries.delete(draftId);
  });
  await entry.closing;
}

export async function sweep(idleMs = 45 * 60_000) {
  const now = Date.now();
  for (const [draftId, entry] of entries) {
    if (now - entry.touchedAt < idleMs) continue;
    if (!entry.session.isOpen) continue;
    if (entry.session.snapshot().busy) continue;
    await closeSession(draftId);
  }
}

export function touch(draftId: string) {
  const entry = entries.get(draftId);
  if (entry) entry.touchedAt = Date.now();
}
