import { z } from "zod";

const batchInfo = z.object({
  engine: z.enum(["card", "bailian"]),
  items: z.array(z.object({
    mediaId: z.uuid(),
    runId: z.uuid(),
    label: z.string(),
    status: z.enum(["queued", "succeeded", "failed"]),
    ratio: z.enum(["3:4", "1:1", "16:9"]).optional(),
  })).max(9),
});

export type PiArtifact = { kind: "candidate"; toolCallId: string; runId: string }
  | { kind: "media"; toolCallId: string; batch: z.infer<typeof batchInfo> };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function mediaArtifact(toolCallId: string, name: string, result: unknown): PiArtifact | null {
  if (name !== "star_stage_note" && name !== "star_render_cards" && name !== "star_generate_images") return null;
  const content = asRecord(result)?.content;
  if (!Array.isArray(content)) return null;
  const text = content.map((part) => asRecord(part)?.text ?? "").join("");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (name === "star_stage_note") {
    const runId = z.uuid().safeParse(asRecord(data)?.runId);
    return runId.success ? { kind: "candidate", toolCallId, runId: runId.data } : null;
  }
  const batch = batchInfo.safeParse(data);
  return batch.success ? { kind: "media", toolCallId, batch: batch.data } : null;
}

export function visibleUserText(text: string) {
  const marker = "\n【用户请求】\n";
  const index = text.startsWith("【摘星上下文】") ? text.lastIndexOf(marker) : -1;
  return index === -1 ? text : text.slice(index + marker.length);
}

function visibleUserMessage(value: unknown, originalText?: string) {
  const message = asRecord(value);
  if (message?.role !== "user") return value;
  if (typeof message.content === "string") return { ...message, content: originalText ?? visibleUserText(message.content) };
  if (!Array.isArray(message.content)) return value;
  return {
    ...message,
    content: message.content.map((part, index) => {
      const entry = asRecord(part);
      if (entry?.type !== "text" || typeof entry.text !== "string") return part;
      return { ...entry, text: (index === 0 ? originalText : undefined) ?? visibleUserText(entry.text) };
    }),
  };
}

export function projectMessages(messages: unknown[], userText: (message: unknown) => string | undefined) {
  return messages.map((message) => trimPayload(visibleUserMessage(message, userText(message))));
}

export function projectEvent(event: { message?: unknown } & Record<string, unknown>, originalText?: string) {
  const projected = event.message ? { ...event, message: visibleUserMessage(event.message, originalText) } : event;
  return trimPayload(projected);
}

export function trimPayload(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const limit = 20_000;
    return value.length > limit ? `${value.slice(0, limit)}…（已截断）` : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth > 7) return "…";
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => trimPayload(entry, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    key === "data" && typeof entry === "string" && entry.length > 512
      ? `（${entry.length} 字节）`
      : trimPayload(entry, depth + 1),
  ]));
}
