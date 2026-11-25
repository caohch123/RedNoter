import type { ParsedXhsNote, ReferenceImage, ReferenceMeta } from "@/lib/api/creation";
import type { PiMessage } from "@/lib/api/pi";

export type DiffLine = {
  kind: "same" | "add" | "remove";
  text: string;
};

export type DiffDisplayLine =
  | DiffLine
  | { kind: "ellipsis"; count: number };

export type TagDiffItem = {
  tag: string;
  kind: "same" | "add" | "remove";
};

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before ? before.split(/\r?\n/) : [];
  const b = after ? after.split(/\r?\n/) : [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }

  const prefix: DiffLine[] = a.slice(0, start).map((text) => ({ kind: "same", text }));
  const suffix: DiffLine[] = a.slice(endA + 1).map((text) => ({ kind: "same", text }));
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  const m = midA.length;
  const n = midB.length;
  const middle: DiffLine[] = [];

  if (m === 0) {
    for (const text of midB) middle.push({ kind: "add", text });
  } else if (n === 0) {
    for (const text of midA) middle.push({ kind: "remove", text });
  } else if (m * n > 40_000) {
    for (const text of midA) middle.push({ kind: "remove", text });
    for (const text of midB) middle.push({ kind: "add", text });
  } else {
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        dp[i][j] = midA[i] === midB[j]
          ? 1 + dp[i + 1][j + 1]
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        middle.push({ kind: "same", text: midA[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        middle.push({ kind: "remove", text: midA[i] });
        i += 1;
      } else {
        middle.push({ kind: "add", text: midB[j] });
        j += 1;
      }
    }
    while (i < m) middle.push({ kind: "remove", text: midA[i++] });
    while (j < n) middle.push({ kind: "add", text: midB[j++] });
  }

  return [...prefix, ...middle, ...suffix];
}

export function collapseDiffContext(lines: DiffLine[], context = 1): DiffDisplayLine[] {
  const changedIndices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].kind !== "same") changedIndices.push(i);
  }
  if (!changedIndices.length) return lines;

  const visible = new Array<boolean>(lines.length).fill(false);
  for (const idx of changedIndices) {
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k += 1) {
      visible[k] = true;
    }
  }

  const out: DiffDisplayLine[] = [];
  let hiddenRun = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (visible[i]) {
      if (hiddenRun > 0) {
        out.push({ kind: "ellipsis", count: hiddenRun });
        hiddenRun = 0;
      }
      out.push(lines[i]);
    } else {
      hiddenRun += 1;
    }
  }
  if (hiddenRun > 0) out.push({ kind: "ellipsis", count: hiddenRun });
  return out;
}

export function diffTags(before: string[], after: string[]): TagDiffItem[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const items: TagDiffItem[] = [];
  for (const tag of before) {
    if (!afterSet.has(tag)) items.push({ tag, kind: "remove" });
  }
  for (const tag of after) {
    items.push({ tag, kind: beforeSet.has(tag) ? "same" : "add" });
  }
  return items;
}

export function extractStageRunIds(messages: PiMessage[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "toolResult") continue;
    const toolResult = msg as { toolName?: string; content?: { text?: string }[]; isError?: boolean };
    if (toolResult.toolName !== "star_stage_note" || toolResult.isError) continue;
    const text = (toolResult.content ?? []).map((part) => part.text ?? "").join("");
    const match = text.match(/"runId":"([0-9a-f-]{36})"/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      ids.push(match[1]);
    }
  }
  return ids;
}

export type MediaBatchItem = {
  mediaId: string;
  runId: string;
  url: string;
  label: string;
  status?: "queued" | "succeeded" | "failed";
};

export type MediaBatch = {
  key: string;
  engine: "card" | "bailian";
  items: MediaBatchItem[];
};

export function parseMediaBatchOutput(text: string, fallbackKey: string): MediaBatch | null {
  try {
    const parsed = JSON.parse(text) as {
      engine?: unknown;
      items?: unknown[];
    };
    if ((parsed.engine !== "card" && parsed.engine !== "bailian") || !Array.isArray(parsed.items)) {
      return null;
    }
    const items: MediaBatchItem[] = [];
    for (const raw of parsed.items) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      if (typeof obj.mediaId !== "string" || typeof obj.runId !== "string" || typeof obj.url !== "string") continue;
      items.push({
        mediaId: obj.mediaId,
        runId: obj.runId,
        url: obj.url,
        label: typeof obj.label === "string" && obj.label.trim() ? obj.label : "配图",
        status: obj.status === "queued" || obj.status === "succeeded" || obj.status === "failed" ? obj.status : undefined,
      });
    }
    if (!items.length) return null;
    const key = items.map((item) => item.runId).join(",") || fallbackKey;
    return { key, engine: parsed.engine, items };
  } catch {
    return null;
  }
}

export function extractMediaBatches(messages: PiMessage[]): MediaBatch[] {
  const batches: MediaBatch[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.role !== "toolResult") continue;
    const toolResult = msg as { toolName?: string; content?: { text?: string }[]; isError?: boolean };
    if ((toolResult.toolName !== "star_render_cards" && toolResult.toolName !== "star_generate_images") || toolResult.isError) {
      continue;
    }
    const text = (toolResult.content ?? []).map((part) => part.text ?? "").join("");
    const parsed = parseMediaBatchOutput(text, `history-${i}`);
    if (parsed && !seen.has(parsed.key)) {
      seen.add(parsed.key);
      batches.push(parsed);
    }
  }
  return batches;
}

export function parseXhsNoteOutput(text: string): ParsedXhsNote | null {
  try {
    const parsed = JSON.parse(text) as { note?: unknown };
    const raw = parsed?.note;
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.noteId !== "string" || !obj.noteId) return null;

    const existingMeta = obj.meta && typeof obj.meta === "object" ? obj.meta as Partial<ReferenceMeta> : null;
    const title = typeof obj.title === "string" ? obj.title : "";
    const body = typeof obj.body === "string" ? obj.body : "";
    const tags = Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === "string") : [];
    const noteType: "image" | "video" = obj.noteType === "video" || existingMeta?.noteType === "video" ? "video" : "image";
    const author = typeof obj.author === "string" ? obj.author : (existingMeta?.author ?? "");
    const authorId = typeof obj.authorId === "string" ? obj.authorId : "";
    const publishedAt = typeof obj.publishedAt === "string" ? obj.publishedAt : (existingMeta?.publishedAt ?? "");
    const url = typeof obj.url === "string" && obj.url ? obj.url : (existingMeta?.url ?? `https://www.xiaohongshu.com/explore/${encodeURIComponent(obj.noteId)}`);

    const numOrNull = (val: unknown): number | null => (typeof val === "number" && Number.isFinite(val) ? val : null);
    const likes = numOrNull(obj.likes ?? existingMeta?.likes);
    const favorites = numOrNull(obj.favorites ?? existingMeta?.favorites);
    const comments = numOrNull(obj.comments ?? existingMeta?.comments);
    const shares = numOrNull(obj.shares ?? existingMeta?.shares);

    const rawImages = Array.isArray(obj.images) ? obj.images : (Array.isArray(existingMeta?.images) ? existingMeta.images : []);
    const images: ReferenceImage[] = [];
    for (const img of rawImages) {
      if (!img || typeof img !== "object") continue;
      const item = img as Record<string, unknown>;
      if (typeof item.url !== "string" || typeof item.sig !== "string") continue;
      images.push({
        url: item.url,
        sig: item.sig,
        role: item.role === "cover" ? "cover" : "media",
      });
    }

    const referenceText = typeof obj.referenceText === "string"
      ? obj.referenceText
      : Array.from([title.trim(), body.trim()].filter(Boolean).join("\n\n")).slice(0, 8000).join("");
    const referenceTitle = typeof obj.referenceTitle === "string"
      ? obj.referenceTitle
      : Array.from(title.trim() || body.trim().split("\n")[0] || "小红书参考笔记").slice(0, 200).join("");
    const referenceTags = Array.isArray(obj.referenceTags)
      ? obj.referenceTags.filter((t): t is string => typeof t === "string")
      : tags;

    const meta: ReferenceMeta = {
      platform: "xiaohongshu",
      noteId: obj.noteId,
      url,
      noteType,
      author: Array.from(author).slice(0, 100).join(""),
      publishedAt: Array.from(publishedAt).slice(0, 64).join(""),
      likes,
      favorites,
      comments,
      shares,
      images,
    };

    return {
      noteId: obj.noteId,
      url,
      title,
      body,
      tags,
      noteType,
      author,
      authorId,
      publishedAt,
      likes,
      favorites,
      comments,
      shares,
      images,
      videoUrl: typeof obj.videoUrl === "string" ? obj.videoUrl : null,
      referenceText,
      referenceTitle,
      referenceTags,
      meta,
    };
  } catch {
    return null;
  }
}
