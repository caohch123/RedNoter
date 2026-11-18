export type CrawlMode = "search" | "homefeed";
export type CrawlRequest = { mode: CrawlMode; count: 10 | 100; keyword: string };
export type CrawlJob = CrawlRequest & {
  id: string;
  ownerId: string;
  state: "queued" | "running" | "converting" | "done" | "failed" | "cancelled";
  message: string;
  received: number;
  attempted?: number;
  failed?: number;
  actual?: number;
  pid?: number;
};

export function validateCrawlRequest(value: unknown): CrawlRequest {
  if (!value || typeof value !== "object") throw new Error("采集参数不正确");
  const data = value as Record<string, unknown>;
  if (data.mode !== "search" && data.mode !== "homefeed") throw new Error("请选择有效的采集方式");
  if (data.count !== 10 && data.count !== 100) throw new Error("采集数量只能是 10 或 100");
  const keyword = typeof data.keyword === "string" ? data.keyword.trim() : "";
  if (data.mode === "search" && (!keyword || keyword.length > 80 || /[,，、\r\n\x00]/.test(keyword))) {
    throw new Error("请输入一个不超过 80 字的关键词，不要使用逗号、顿号或换行");
  }
  return { mode: data.mode, count: data.count, keyword: data.mode === "search" ? keyword : "" };
}
