import type { ApiErrorBody, ApiErrorCode } from "./types";

/**
 * 所有请求都走同源的 /api 前缀：
 * - 没配后端时，命中 src/app/api 下的 mock 接口；
 * - 配了 API_PROXY_TARGET 后，next.config.ts 会把 /api/* 转发到 Fastify。
 * 这样 cookie 始终是同源的，前端代码不用关心后端在哪。
 */
const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  // FormData（上传文件）原样发送，由浏览器自己带 multipart 边界；其余按 JSON 发送
  const isJson = options.body !== undefined && !(options.body instanceof FormData);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      signal: options.signal,
      headers: isJson ? { "Content-Type": "application/json" } : undefined,
      body: isJson ? JSON.stringify(options.body) : (options.body as FormData | undefined),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "网络连接失败，请稍后再试", 0);
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(
      err?.code ?? "UNKNOWN",
      err?.message ?? "服务开小差了，请稍后再试",
      res.status,
    );
  }
  return data as T;
}
