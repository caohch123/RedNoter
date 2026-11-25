import { createHash } from "node:crypto";
import { z } from "zod";

export const piImageItemsSchema = z.array(z.object({
  label: z.string().trim().min(1).max(80).describe("在预览卡片中显示的简短标题"),
  prompt: z.string().trim().min(1).max(2000).describe("描述画面主体、光线、构图、质感和色调"),
  ratio: z.enum(["3:4", "1:1", "16:9"]).default("3:4").describe("画面比例，小红书图文默认 3:4"),
})).min(1).max(6);

export const piImageApprovalSchema = z.object({
  sessionId: z.string().min(1).max(200),
  turnRequestId: z.uuid(),
  revision: z.number().int().nonnegative(),
  approvalId: z.uuid(),
  items: piImageItemsSchema,
});

export type PiImageApproval = z.infer<typeof piImageApprovalSchema>;

function deterministicUuid(parts: (string | number)[]) {
  const bytes = createHash("sha256").update(JSON.stringify(parts)).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function piImageApprovalId(draftId: string, sessionId: string, turnRequestId: string, toolCallId: string) {
  return deterministicUuid(["pi-image-approval", draftId, sessionId, turnRequestId, toolCallId]);
}

export function piImageBatchIdentity(draftId: string, ownerId: string, approval: PiImageApproval) {
  const { sessionId, turnRequestId, revision, approvalId, items } = approval;
  const fingerprint = createHash("sha256").update(JSON.stringify([
    "pi-image-approval", ownerId, draftId, sessionId, turnRequestId, revision, approvalId,
    items.map(({ label, prompt, ratio }) => [label, prompt, ratio]),
  ])).digest("hex");
  const runIds = items.map((_, index) => index === 0 ? approvalId : deterministicUuid(["pi-image-run", approvalId, index]));
  return { fingerprint, runIds };
}
