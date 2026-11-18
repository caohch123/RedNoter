import { cookies } from "next/headers";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSION_COOKIE } from "@/lib/api/types";
import { findUserById, readSessionToken } from "@/lib/mock/store";
import { validateCrawlRequest, type CrawlJob } from "@/lib/crawl-types";

const toolRoot = () => path.resolve(process.cwd(), "..", "tools", "xhs");
const runtimeRoot = () => path.join(toolRoot(), ".runtime");
const jobPath = (id: string) => path.join(runtimeRoot(), id, "status.json");
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

async function authorize(request: Request) {
  const url = new URL(request.url);
  const browserOrigin = new URL(url.protocol + "//" + (request.headers.get("host") ?? url.host));
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(browserOrigin.hostname)) {
    return Response.json({ message: "采集仅支持在运行项目的本机开发环境使用" }, { status: 403 });
  }
  if (request.method !== "GET" && request.headers.get("origin") !== browserOrigin.origin) {
    return Response.json({ message: "不允许跨站启动或停止采集" }, { status: 403 });
  }
  const id = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id || !(await findUserById(id))) return Response.json({ message: "请先登录网页" }, { status: 401 });
  return id;
}

async function readJob(id: string): Promise<CrawlJob> {
  const job: CrawlJob = JSON.parse(await readFile(jobPath(id), "utf8"));
  if (job.state === "queued" && !job.pid && Date.now() - (await stat(jobPath(id))).mtimeMs > 30000) {
    job.state = "failed";
    job.message = "采集程序未能启动，请检查工具环境后重试";
    await writeFile(jobPath(id), JSON.stringify(job));
  }
  if (["queued", "running", "converting"].includes(job.state) && job.pid) {
    try { process.kill(job.pid, 0); } catch {
      job.state = "failed";
      job.message = "采集进程已停止，请重新开始";
      await writeFile(jobPath(id), JSON.stringify(job));
    }
  }
  return job;
}

async function activeJob() {
  const lock = path.join(runtimeRoot(), "active.lock");
  try {
    const id = (await readFile(lock, "utf8")).trim();
    if (!validId(id)) return null;
    const job = await readJob(id);
    if (["queued", "running", "converting"].includes(job.state)) return job;
    await unlink(lock).catch(() => undefined);
  } catch { /* 首次运行没有任务。 */ }
  return null;
}

export async function GET(request: Request) {
  const ownerId = await authorize(request);
  if (ownerId instanceof Response) return ownerId;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    const ready = await access(path.join(toolRoot(), ".venv", "Scripts", "python.exe")).then(() => true, () => false);
    const active = await activeJob();
    return Response.json({ ready, active: active?.ownerId === ownerId ? active : null, busy: !!active });
  }
  if (!validId(id)) return Response.json({ message: "无效任务 ID" }, { status: 400 });
  try {
    const job = await readJob(id);
    if (job.ownerId !== ownerId) return Response.json({ message: "无权查看该任务" }, { status: 403 });
    const posts = job.state === "done" ? JSON.parse(await readFile(path.join(runtimeRoot(), id, "result.json"), "utf8")) : undefined;
    return Response.json({ job, posts });
  } catch { return Response.json({ message: "任务不存在或结果不可读，请重新采集" }, { status: 404 }); }
}

export async function POST(request: Request) {
  const ownerId = await authorize(request);
  if (ownerId instanceof Response) return ownerId;
  let input;
  try { input = validateCrawlRequest(await request.json()); }
  catch (error) { return Response.json({ message: error instanceof Error ? error.message : "参数不正确" }, { status: 400 }); }
  try { await access(path.join(toolRoot(), ".venv", "Scripts", "python.exe")); }
  catch { return Response.json({ message: "请先在项目根目录运行 tools/xhs/install.ps1 初始化采集环境" }, { status: 503 }); }
  if (await activeJob()) return Response.json({ message: "已有采集任务运行，请等待完成或先停止" }, { status: 409 });
  await mkdir(runtimeRoot(), { recursive: true });
  const id = randomUUID();
  const lock = path.join(runtimeRoot(), "active.lock");
  try { const handle = await open(lock, "wx"); await handle.writeFile(id); await handle.close(); }
  catch { return Response.json({ message: "已有任务正在启动，请稍后重试" }, { status: 409 }); }
  const job: CrawlJob = { ...input, id, ownerId, state: "queued", message: "正在启动，请在弹出的浏览器中登录或完成验证", received: 0 };
  try {
    await mkdir(path.dirname(jobPath(id)), { recursive: true });
    await writeFile(jobPath(id), JSON.stringify(job));
    const child = spawn(process.execPath, [path.join(toolRoot(), "web-worker.mjs"), id], {
      cwd: toolRoot(), detached: true, windowsHide: true, stdio: "ignore",
    });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    return Response.json({ job }, { status: 202 });
  } catch {
    await unlink(lock).catch(() => undefined);
    job.state = "failed";
    job.message = "无法启动采集程序，请检查工具目录和 Python 环境";
    await writeFile(jobPath(id), JSON.stringify(job)).catch(() => undefined);
    return Response.json({ message: job.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ownerId = await authorize(request);
  if (ownerId instanceof Response) return ownerId;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!validId(id)) return Response.json({ message: "无效任务 ID" }, { status: 400 });
  try {
    const job = await readJob(id);
    if (job.ownerId !== ownerId) return Response.json({ message: "无权停止该任务" }, { status: 403 });
    await writeFile(path.join(runtimeRoot(), id, "cancel"), "cancel");
    return Response.json({ message: "已请求停止" });
  } catch { return Response.json({ message: "任务不存在" }, { status: 404 }); }
}
