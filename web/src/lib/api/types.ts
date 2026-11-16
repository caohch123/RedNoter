/**
 * 前后端接口契约（登录模块）。
 * 后端（Fastify + Prisma）按这里的结构实现即可；接口文档定稿后以 Apifox 为准，改这一个文件。
 */

export type User = {
  id: string;
  username: string;
  createdAt: string; // ISO 8601
};

export type Credentials = {
  username: string;
  password: string;
};

/** POST /auth/login、POST /auth/register、GET /auth/me 的成功响应 */
export type AuthResponse = {
  user: User;
};

/** 所有失败响应统一为这个结构，配合 HTTP 状态码 */
export type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
};

export type ApiErrorCode =
  | "VALIDATION_ERROR" // 400 字段不合法
  | "INVALID_CREDENTIALS" // 401 用户名或密码错误
  | "UNAUTHORIZED" // 401 未登录或登录已失效
  | "USERNAME_TAKEN" // 409 用户名已被注册
  | "NETWORK_ERROR" // 前端自用：请求没发出去
  | "UNKNOWN";

/** 会话 cookie 名：登录成功后由服务端以 httpOnly 方式写入 */
export const SESSION_COOKIE = "zx_session";
