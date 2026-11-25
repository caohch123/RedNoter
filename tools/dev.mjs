/**
 * 一条命令起齐本地服务：API、Pi 运行器、Web，以及可选的小红书采集服务。
 *
 * 存在的理由：分开起终端容易漏，漏了 Pi 运行器时中栏只会显示「无法连接」，
 * 不容易一眼看出是哪个进程没起。这里把日志加上前缀合并输出，Ctrl+C 一次全停。
 * 采集服务（collector）标记为 optional，缺少 Python 时仅打警告，不拖垮主工作台。
 *
 * 跑法：npm run dev
 */
import { spawn } from "node:child_process";

const services = [
  { name: "api", command: "npm", args: ["run", "dev:api"], color: 36, optional: false },
  { name: "pi", command: "npm", args: ["run", "dev:pi"], color: 35, optional: false },
  { name: "collector", command: "npm", args: ["run", "dev:collector"], color: 33, optional: true },
  { name: "web", command: "npm", args: ["run", "dev:web"], color: 32, optional: false },
];

const paint = (code, text) => (process.stdout.isTTY ? `\u001b[${code}m${text}\u001b[0m` : text);
const children = [];
let stopping = false;

for (const service of services) {
  const child = spawn(service.command, service.args, {
    shell: process.platform === "win32",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push({ child, name: service.name });

  const relay = (stream, target) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) target.write(`${paint(service.color, `[${service.name}]`)} ${line}\n`);
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    if (stopping) return;
    child.exitCode = code ?? 1;
    if (service.optional) {
      console.warn(`${paint(33, `[${service.name}]`)} 可选服务已退出（code=${code ?? "null"} signal=${signal ?? "null"}）；主服务继续运行，小红书链接解析功能暂不可用。`);
      return;
    }
    console.log(`${paint(31, `[${service.name}]`)} 已退出（code=${code ?? "null"} signal=${signal ?? "null"}）`);
    shutdown(code ?? 1);
  });
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    for (const { child } of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    process.exit(code);
  }, 3000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
