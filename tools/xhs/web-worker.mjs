import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(id ?? "")) process.exit(1);
const directory = path.join(root, ".runtime", id);
const statusFile = path.join(directory, "status.json");
const job = JSON.parse(readFileSync(statusFile, "utf8"));
const python = path.join(root, ".venv", "Scripts", "python.exe");
const started = Date.now();
let child;
let cancelled = false;
function save() {
  writeFileSync(statusFile + ".tmp", JSON.stringify(job));
  renameSync(statusFile + ".tmp", statusFile);
}
function kill() {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else child.kill("SIGTERM");
}
function run(args, cwd) {
  return new Promise((resolve, reject) => {
    child = spawn(python, ["-u", ...args], { cwd, windowsHide: true, env: {
      ...process.env, PYTHONIOENCODING: "utf-8", REDNOTER_CRAWL_MODE: job.mode,
    }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    let pending = "";
    child.stdout.on("data", chunk => {
      // 原始日志只留在本机，不把 Cookie、响应内容或签名返回网页。
      appendFileSync(path.join(directory, "worker.log"), chunk);
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/); pending = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("REDNOTER_PROGRESS ")) {
        try {
          const event = JSON.parse(line.slice("REDNOTER_PROGRESS ".length));
          if (typeof event.received === "number") job.received = event.received;
          if (typeof event.attempted === "number") job.attempted = event.attempted;
          if (typeof event.failed === "number") job.failed = event.failed;
          if (typeof event.message === "string") job.message = event.message;
          save();
        } catch { /* 不使用无法解析的进度行。 */ }
      }
    });
    child.stderr.on("data", data => appendFileSync(path.join(directory, "worker.log"), data));
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error("采集进程退出")));
  });
}
job.pid = process.pid;
job.state = "running";
job.message = "请在弹出的浏览器中扫码登录或完成验证；随后开始获取帖子";
save();
const monitor = setInterval(() => {
  if (existsSync(path.join(directory, "cancel")) || Date.now() - started > 60 * 60 * 1000) {
    cancelled = true;
    kill();
  }
}, 1000);
try {
  const raw = path.join(directory, "raw"); mkdirSync(raw, { recursive: true });
  await run(["main.py", "--platform", "xhs", "--lt", "qrcode", "--type", "search", "--keywords", job.keyword || "首页推荐",
    "--get_comment", "false", "--get_sub_comment", "false", "--get_media", "false", "--crawler_max_notes_count", String(job.count),
    "--save_data_option", "json", "--save_data_path", raw], path.join(root, "MediaCrawler"));
  if (cancelled) throw new Error("停止");
  if (job.received === 0) throw new Error("NO_POSTS");
  job.state = "converting"; job.message = "正在整理正文、标签并下载图片，请稍候"; save();
  await run([path.join(root, "convert_xhs.py"), raw, path.join(directory, "result.json"), String(job.count)], root);
  if (cancelled) throw new Error("停止");
  const posts = JSON.parse(readFileSync(path.join(directory, "result.json"), "utf8"));
  job.actual = posts.length;
  job.received = posts.length;
  job.state = "done";
  job.message = `采集完成，实际获取 ${posts.length} / ${job.count} 条；有效帖子不足或部分详情不可用时可能少于目标数量`;
} catch (error) {
  job.state = cancelled ? "cancelled" : "failed";
  job.message = cancelled ? "采集已停止（或超过一小时运行上限），已有网页帖子不变" : error.message === "NO_POSTS"
    ? "未获取到有效详情；请查看本机日志中的 REDNOTER_DETAIL 和 REDNOTER_HTTP 诊断行"
    : "采集失败：请检查 Python 依赖、浏览器登录、网络或平台验证。本机日志位于 tools/xhs/.runtime/任务ID/worker.log";
} finally {
  clearInterval(monitor);
  save();
  const lock = path.join(root, ".runtime", "active.lock");
  try { if (readFileSync(lock, "utf8").trim() === id) unlinkSync(lock); } catch { /* 已释放。 */ }
}
