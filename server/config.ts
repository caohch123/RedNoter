import "dotenv/config";
import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();
export const env = {
  port: Number(process.env.CREATION_PORT ?? 3002),
  host: process.env.CREATION_HOST ?? "127.0.0.1",
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:3000",
  accountUrl: process.env.ACCOUNT_ME_URL ?? "http://localhost:3000/api/auth/me",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6380",
  modelMode: process.env.MODEL_MODE ?? "demo",
  mediaMode: process.env.MEDIA_MODE ?? "local",
  publishToken: process.env.PUBLISH_READ_TOKEN ?? "",
  piRunnerPort: Number(process.env.PI_RUNNER_PORT ?? 3013),
  piRunnerHost: process.env.PI_RUNNER_HOST ?? "127.0.0.1",
  piRunnerUrl: (process.env.PI_RUNNER_URL ?? `http://127.0.0.1:${process.env.PI_RUNNER_PORT ?? 3013}`).replace(/\/$/, ""),
  piRunnerToken: process.env.PI_RUNNER_TOKEN ?? "",
  piRoot: process.env.PI_ROOT ?? ".creation-pi",
  piAgentDir: process.env.PI_AGENT_DIR ?? "",
  /** 网页终端额外加载的扩展文件，逗号分隔；用来验证终端专属能力。 */
  piTerminalExtensions: (process.env.PI_TERMINAL_EXTENSIONS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  /** 中栏 Pi 可用模型白名单（逗号分隔，格式 provider/id；留空则展示全部可用模型）。 */
  piAllowedModels: (process.env.PI_ALLOWED_MODELS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  xhsCollectorPort: Number(process.env.XHS_COLLECTOR_PORT ?? 5557),
  xhsCollectorUrl: (process.env.XHS_COLLECTOR_URL ?? `http://127.0.0.1:${process.env.XHS_COLLECTOR_PORT ?? 5557}`).replace(/\/$/, ""),
  xhsCollectorToken: process.env.XHS_COLLECTOR_TOKEN ?? "",
  xhsCollectorPython: process.env.XHS_COLLECTOR_PYTHON ?? "",
};

export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`请设置 ${name}`);
  return value;
}
