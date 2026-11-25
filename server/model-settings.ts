import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ModelProfile } from "@prisma/client";
import { z } from "zod";
import { db, env } from "./config.js";
import { capability, type Capability } from "./domain.js";

export const presets: Record<Capability, string> = {
  text: "qwen-plus", cover: "wan2.7-image", textToVideo: "wan2.7-t2v", imageToVideo: "wan2.7-i2v", vision: "",
};
export const defaultExternalContextWindow = 16_384;
export const modelInput = z.object({
  provider: z.enum(["bailian", "openai-compatible"]),
  baseUrl: z.url().max(500),
  modelId: z.string().trim().min(1).max(150).regex(/^[\w.:/-]+$/),
  apiKey: z.string().trim().min(1).max(1024).regex(/^[\x21-\x7e]+$/).optional(),
  credentialFrom: capability.optional(),
  contextWindow: z.number().int().min(2048).max(10_000_000).nullable().optional(),
});
export type ModelInput = z.infer<typeof modelInput>;
export type Resolved = Pick<ModelInput, "provider" | "baseUrl" | "modelId" | "contextWindow"> & {
  apiKey: string; toolsVerified?: boolean; vision?: boolean;
};
export const capabilities = Object.keys(presets) as Capability[];
export const isAdmin = (id: string) => (process.env.CREATION_MODEL_ADMIN_IDS ?? "").split(",").map((v) => v.trim()).includes(id);

function masterKey() {
  const key = process.env.CREATION_MODEL_CONFIG_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error("MODEL_KEY_UNCONFIGURED");
  return Buffer.from(key, "hex");
}
export const hasMasterKey = () => /^[0-9a-f]{64}$/i.test(process.env.CREATION_MODEL_CONFIG_KEY ?? "");
export const latest = (kind: Capability) => db.modelProfile.findFirst({ where: { capability: kind }, orderBy: { version: "desc" } });

export function checkUrl(value: string, provider: ModelInput["provider"]) {
  const url = new URL(value);
  const hostname = url.hostname;
  const bailian = url.protocol === "https:" && !url.port && (
    hostname === "dashscope.aliyuncs.com" || hostname === "dashscope-intl.aliyuncs.com" ||
    /^(?:[a-z0-9-]+)\.(?:cn-beijing|ap-southeast-1|cn-hongkong|us-east-1)\.maas\.aliyuncs\.com$/.test(hostname)
  );
  const allowed = (process.env.CREATION_MODEL_ORIGINS ?? "").split(",").map((v) => v.trim()).includes(url.origin);
  if (url.username || url.password || url.search || url.hash ||
      (!bailian && !allowed) || !["http:", "https:"].includes(url.protocol) || (provider === "bailian" && !bailian && !allowed)) {
    throw new Error("MODEL_ADDRESS_DENIED");
  }
  return url.toString().replace(/\/$/, "");
}

const aad = (url: string) => Buffer.from(url);
function seal(key: string, url: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(aad(url));
  return Buffer.concat([iv, cipher.update(key, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
}
function unseal(profile: ModelProfile) {
  const bytes = Buffer.from(profile.encryptedKey, "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), bytes.subarray(0, 12));
  decipher.setAAD(aad(profile.baseUrl));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
}

export function profileView(profile: ModelProfile) {
  const { id, capability, baseUrl, modelId, provider, createdAt, contextWindow } = profile;
  return { id, capability, baseUrl, modelId, provider, createdAt, contextWindow,
    toolsVerified: profile.toolsVerified, hasCredential: Boolean(profile.encryptedKey) };
}

export async function saveProfile(kind: Capability, input: ModelInput, ownerId: string) {
  const baseUrl = checkUrl(input.baseUrl, input.provider);
  if (kind !== "text" && kind !== "vision" && input.provider !== "bailian") throw new Error("MEDIA_PROVIDER_UNSUPPORTED");
  const prior = await latest(input.credentialFrom ?? kind);
  const reused = prior && new URL(prior.baseUrl).origin === new URL(baseUrl).origin ? prior : null;
  const key = input.apiKey ?? (reused && unseal(reused));
  if (!key) throw new Error("MODEL_CREDENTIAL_REQUIRED");
  const previousWindow = reused?.capability === kind && reused.modelId === input.modelId && reused.baseUrl === baseUrl
    ? reused.contextWindow : null;
  return db.modelProfile.create({ data: {
    capability: kind, provider: input.provider, modelId: input.modelId, baseUrl,
    contextWindow: kind === "text" || kind === "vision" ? input.contextWindow === undefined ? previousWindow : input.contextWindow : null,
    encryptedKey: seal(key, baseUrl), updatedBy: ownerId,
  } });
}

export function credentials(profile: ModelProfile): Resolved {
  if (profile.provider !== "bailian" && profile.provider !== "openai-compatible") throw new Error("未知模型服务");
  return { provider: profile.provider, baseUrl: checkUrl(profile.baseUrl, profile.provider), modelId: profile.modelId,
    contextWindow: profile.contextWindow, apiKey: unseal(profile), toolsVerified: profile.toolsVerified, vision: profile.capability === "vision" };
}

export async function status(userId: string) {
  const profiles = await Promise.all(capabilities.map(latest));
  const active = Object.fromEntries(capabilities.map((kind, i) => [
    kind, profiles[i] ? hasMasterKey() : kind === "text" && (env.modelMode === "demo" ||
      Boolean(process.env.PI_MODEL_PROVIDER && process.env.PI_MODEL_ID && process.env.PI_MODEL_API_KEY)),
  ])) as Record<Capability, boolean>;
  return { demo: !profiles[0] && env.modelMode === "demo", admin: isAdmin(userId), active,
    toolsEnabled: active.text && Boolean(profiles[0]?.toolsVerified) };
}
