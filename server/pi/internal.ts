import { env } from "../config.js";
import type { ParsedXhsNote } from "../xhs.js";
import type { PiImageApproval } from "./image-approval.js";
import type { StarBridge, StarNote } from "./star-extension.js";

const base = (process.env.PI_INTERNAL_URL ?? `http://127.0.0.1:${env.port}`).replace(/\/$/, "");

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!env.piRunnerToken) throw new Error("PI_RUNNER_TOKEN 未配置，无法访问摘星数据");
  const response = await fetch(`${base}/internal/pi${path}`, {
    method: init?.method ?? "POST",
    headers: { "content-type": "application/json", "x-pi-runner-token": env.piRunnerToken },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(data?.message ?? `摘星接口返回 ${response.status}`);
  return data as T;
}

export async function readNote(ownerId: string, draftId: string) {
  const query = new URLSearchParams({ ownerId });
  return call<StarNote>(`/drafts/${draftId}?${query}`, { method: "GET" });
}

export async function stageNote(ownerId: string, draftId: string, input: Parameters<StarBridge["stageNote"]>[0]) {
  return call<{ runId: string; revision: number; current?: number }>(`/drafts/${draftId}/stage`, {
    body: { ...input, ownerId },
  });
}

export type MediaBatchItem = {
  mediaId: string;
  runId: string;
  url: string;
  label: string;
  prompt?: string;
  ratio?: "3:4" | "1:1" | "16:9";
  status: "queued" | "succeeded" | "failed";
};

export type MediaBatchResult = {
  engine: "card" | "bailian";
  revision: number;
  items: MediaBatchItem[];
};

export async function renderCards(ownerId: string, draftId: string, input: {
  cards: import("../card-renderer.js").CardSpec[];
  requestId: string;
}) {
  return call<MediaBatchResult>(`/drafts/${draftId}/render-cards`, {
    body: { ...input, ownerId },
  });
}

export type ParsedXhsNoteResult = ParsedXhsNote;

export async function generateImages(ownerId: string, draftId: string, approval: PiImageApproval) {
  return call<MediaBatchResult>(`/drafts/${draftId}/generate-images`, {
    body: { ...approval, ownerId },
  });
}

export async function parseXhsNote(ownerId: string, draftId: string, input: { text: string }) {
  const res = await call<{ note: ParsedXhsNoteResult }>(`/drafts/${draftId}/parse-xhs`, {
    body: { ...input, ownerId },
  });
  return res.note;
}
