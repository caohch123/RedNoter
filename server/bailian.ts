import { z } from "zod";
import { imageType } from "./media.js";
import type { mediaInput, MediaKind } from "./domain.js";
import type { Resolved } from "./model-settings.js";

const envelope = z.object({
  code: z.string().optional(),
  request_id: z.string().optional(),
  output: z.object({
    task_id: z.string().optional(), task_status: z.string().optional(), video_url: z.string().optional(),
    choices: z.array(z.object({ message: z.object({ content: z.array(z.object({
      image: z.string().optional(),
    })) }) })).optional(),
    code: z.string().optional(),
  }).optional(),
});
export class MediaFailure extends Error {
  constructor(message: string, public readonly stage: "rejected" | "unknown" | "poll" | "download" | "provider",
    public readonly status?: number, public readonly code?: string, public readonly requestId?: string) { super(message); }
  get detail() {
    return { stage: this.stage, ...(this.status ? { status: this.status } : {}),
      ...(this.code ? { code: this.code } : {}), ...(this.requestId ? { requestId: this.requestId } : {}) };
  }
}
const safeToken = (value?: string | null) => value && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : undefined;
const rejectedHint = (status: number, code?: string) => code === "Arrearage" ? "百炼账户欠费，请检查账户余额与账单。"
  : status === 401 ? "百炼鉴权失败，请检查媒体模型的地域与密钥。"
  : status === 403 ? "百炼拒绝访问此模型，请检查模型权限与账户状态。"
    : status === 404 ? "百炼找不到该媒体模型或接口，请检查模型与接入地址。"
      : status === 429 ? "百炼请求受限，请检查额度或稍后重新发起。"
        : "百炼拒绝了生成请求，请检查模型与生成参数。";

async function request(profile: Resolved, path: string, payload?: unknown) {
  return fetch(`${profile.baseUrl}/${path}`, {
    method: payload ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      ...(payload ? { "Content-Type": "application/json", "X-DashScope-Async": "enable" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
}

export async function startBailian(profile: Resolved, kind: MediaKind, brief: z.infer<typeof mediaInput>, frame?: string) {
  const image = kind === "cover" || kind === "image";
  const path = image ? "services/aigc/image-generation/generation" : "services/aigc/video-generation/video-synthesis";
  const prompt = brief.prompt;
  const input = image ? { messages: [{ role: "user", content: [{ text: kind === "cover" ? `小红书图文笔记竖版封面，3:4 构图。\n${prompt}` : prompt }] }] }
    : { prompt, ...(frame ? { media: [{ type: "first_frame", url: frame }] } : {}) };
  const size = kind === "image" && brief.ratio === "1:1" ? "1080*1080" : kind === "image" && brief.ratio === "16:9" ? "1536*864" : "1080*1440";
  const parameters = image ? { size, n: 1 }
    : { resolution: "720P", duration: brief.duration ?? 5, ...(kind === "textToVideo" ? { ratio: brief.ratio ?? "9:16" } : {}) };
  const unsure = "百炼是否已接收这次任务暂不明确。请先核对百炼任务记录，再决定是否重新生成。";
  const response = await request(profile, path, { model: profile.modelId, input, parameters }).catch(() => { throw new MediaFailure(unsure, "unknown"); });
  const parsed = envelope.safeParse(await response.json().catch(() => null)).data;
  const requestId = safeToken(parsed?.request_id ?? response.headers.get("x-request-id"));
  const code = safeToken(parsed?.code);
  if (response.ok && parsed?.output?.task_id) return { taskId: parsed.output.task_id, status: response.status, requestId };
  if ((response.status >= 400 && response.status < 500 && response.status !== 408) || (response.ok && code)) {
    throw new MediaFailure(rejectedHint(response.status, code), "rejected", response.status, code, requestId);
  }
  throw new MediaFailure(unsure, "unknown", response.status, code, requestId);
}

export async function getBailian(profile: Resolved, taskId: string) {
  const hint = "百炼已接收任务，但暂时无法读取进度。可以继续查询。";
  const response = await request(profile, `tasks/${encodeURIComponent(taskId)}`).catch(() => { throw new MediaFailure(hint, "poll"); });
  const parsed = envelope.safeParse(await response.json().catch(() => null)).data;
  const code = safeToken(parsed?.code ?? parsed?.output?.code);
  const requestId = safeToken(parsed?.request_id ?? response.headers.get("x-request-id"));
  if (!response.ok || !parsed?.output?.task_status) throw new MediaFailure(hint, "poll", response.status, code, requestId);
  const { output } = parsed;
  const url = output?.video_url ?? output?.choices?.flatMap(({ message }) => message.content).find((item) => item.image)?.image;
  return { status: output?.task_status, url, statusCode: response.status, code, requestId };
}

export async function testBailian(profile: Resolved) {
  const response = await request(profile, "models");
  if (!response.ok) throw new Error("百炼不接受当前地址或密钥");
  const data = await response.json() as { data?: { id?: string }[]; output?: { models?: { model_id?: string }[] } };
  const models = data.data?.map((m) => m.id) ?? data.output?.models?.map((m) => m.model_id);
  return { ok: true, note: models?.includes(profile.modelId)
    ? "连接成功，目录中有此模型。"
    : "目录连接通过。请从创作页生成一次，确认这个模型的权限。" };
}

export async function downloadResult(value: string, cover: boolean) {
  const url = new URL(value);
  const explicit = (process.env.CREATION_MEDIA_RESULT_ORIGINS ?? "").split(",").map((v) => v.trim()).includes(url.origin);
  const ossHost = url.protocol === "https:" && !url.port &&
    /^(?:[a-z0-9-]+\.)+oss(?:-[a-z0-9-]+)?\.aliyuncs\.com$/i.test(url.hostname);
  if (url.username || url.password || (!explicit && !ossHost)) throw new Error("媒体结果地址无效");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(70_000) });
  if (!response.ok || !response.body) throw new Error("暂时无法取回媒体");
  const max = (cover ? 12 : 96) * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > max) throw new Error("媒体结果过大");
  const reader = response.body.getReader();
  const pieces: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) throw new Error("媒体结果过大");
      pieces.push(Buffer.from(chunk.value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = Buffer.concat(pieces, size);
  const mime = cover ? imageType(bytes) : bytes.toString("ascii", 4, 8) === "ftyp" ? "video/mp4" : undefined;
  if (!mime) throw new Error("媒体结果格式无效");
  return { bytes, mime };
}
