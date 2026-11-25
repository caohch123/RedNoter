/**
 * 启动本地小红书链接解析 Python 采集服务（127.0.0.1:5557）。
 *
 * 跑法：npm run dev:collector
 */
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, ".creation-collector");
const tokenFile = join(dataDir, "collector.token");
const serverScript = resolve(root, "collector", "server.py");

function resolvePython() {
  const configured = process.env.XHS_COLLECTOR_PYTHON?.trim();
  if (configured) {
    if (existsSync(configured)) return configured;
    const probe = spawnSync(configured, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return configured;
  }
  const candidates = process.platform === "win32"
    ? [
        resolve(root, ".tools", "py312", "python.exe"),
        resolve(root, ".venv", "Scripts", "python.exe"),
        "python",
        "python3",
      ]
    : [
        resolve(root, ".venv", "bin", "python"),
        resolve(root, ".tools", "py312", "bin", "python3"),
        "python3",
        "python",
      ];

  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function ensureToken() {
  const fromEnv = process.env.XHS_COLLECTOR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(tokenFile)) {
    const existing = readFileSync(tokenFile, "utf8").trim();
    if (existing) return existing;
  }
  const generated = randomBytes(32).toString("hex");
  writeFileSync(tokenFile, generated, { encoding: "utf8", mode: 0o600 });
  return generated;
}

if (!existsSync(serverScript)) {
  console.error("[collector] 未找到 collector/server.py，小红书链接解析服务未启动。");
  process.exit(2);
}

const python = resolvePython();
if (!python) {
  console.error("[collector] 未找到可用的 Python 3.12+ 运行时（.tools/py312/python.exe 或系统 python）。小红书链接解析服务未启动，其余功能不受影响。");
  process.exit(2);
}

const port = String(Number(process.env.XHS_COLLECTOR_PORT ?? 5557) || 5557);
const token = ensureToken();

console.log(`[collector] 启动小红书链接解析服务 http://127.0.0.1:${port}`);

const child = spawn(python, [serverScript], {
  cwd: root,
  env: {
    ...process.env,
    PYTHONUTF8: "1",
    XHS_COLLECTOR_PORT: port,
    XHS_COLLECTOR_TOKEN: token,
  },
  stdio: "inherit",
});

function forwardSignal(signal) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("error", (error) => {
  console.error(`[collector] 启动失败：${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
