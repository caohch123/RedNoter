import { z } from "zod";

export const referenceSchema = z.object({
  id: z.string().min(1).max(200), title: z.string().max(200), body: z.string().max(8000),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source: z.object({ platform: z.string(), url: z.url() }).optional(),
});
const referencePage = z.object({ items: z.array(referenceSchema), nextCursor: z.string().nullable() });
export const assetSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("text"), content: z.object({ text: z.string().max(8000) }) }),
  z.object({ id: z.string(), type: z.literal("image"), content: z.object({ accessUrl: z.url() }) }),
]);

export class SourceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function sourceAvailability() {
  return { topics: Boolean(process.env.TOPICS_API_URL), assets: Boolean(process.env.ASSETS_API_URL) };
}

async function load(service: "TOPICS" | "ASSETS", path: string, cookie: string) {
  const base = process.env[`${service}_API_URL`];
  if (!base) throw new SourceError(503, service === "TOPICS" ? "话题追踪尚未接入，可以粘贴参考笔记。" : "素材库尚未接入。");
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      headers: { cookie }, signal: AbortSignal.timeout(8000), redirect: "error",
    });
    if (response.status === 404 || response.status === 403) throw new SourceError(404, "来源不存在或没有访问权限。");
    if (!response.ok) throw new Error("来源请求失败");
    return await response.json();
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(503, "暂时无法读取来源，请稍后重试。");
  }
}

export async function readReference(id: string, cookie: string) {
  return referenceSchema.parse(await load("TOPICS", `/v1/topics/references/${encodeURIComponent(id)}`, cookie));
}
export async function findReferences(query: { keyword?: string; cursor?: string }, cookie: string) {
  const params = new URLSearchParams();
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.cursor) params.set("cursor", query.cursor);
  return referencePage.parse(await load("TOPICS", `/v1/topics/references?${params}`, cookie));
}
export async function readAsset(id: string, cookie: string) {
  return assetSchema.parse(await load("ASSETS", `/v1/assets/${encodeURIComponent(id)}`, cookie));
}
