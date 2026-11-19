import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api/types";
import { findUserById, readSessionToken } from "@/lib/mock/store";
import { deleteMedia } from "@/lib/delete-media";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function POST(request: Request) {
  // 当前收藏保存在本地浏览器，该接口仅用于本机开发版本。
  const url = new URL(request.url);
  const browserOrigin = new URL(url.protocol + "//" + (request.headers.get("host") ?? url.host));
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(browserOrigin.hostname)) {
    return Response.json({ message: "图片清理仅限本机开发环境" }, { status: 403 });
  }
  if (request.headers.get("origin") !== browserOrigin.origin) {
    return Response.json({ message: "不允许跨站删除图片" }, { status: 403 });
  }
  const userId = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId || !(await findUserById(userId))) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }
  // 采集结果导入前，新下载图片还没有进入浏览器的引用列表。
  // 此时暂缓清理，避免删掉正在采集的素材。
  try {
    const runtime = path.resolve(process.cwd(), "..", "tools", "xhs", ".runtime");
    const id = (await readFile(path.join(runtime, "active.lock"), "utf8")).trim();
    if (/^[a-f0-9-]{36}$/.test(id)) {
      const job = JSON.parse(await readFile(path.join(runtime, id, "status.json"), "utf8"));
      if (["queued", "running", "converting"].includes(job.state)) {
        return Response.json({ message: "正在采集，图片清理已暂缓，请在采集完成后重试" }, { status: 409 });
      }
    }
  } catch { /* 没有正在运行的本地采集任务。 */ }
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.candidates) || body.candidates.length > 500) {
    return Response.json({ message: "无效清理请求" }, { status: 400 });
  }
  try {
    return Response.json(await deleteMedia(body.candidates, process.cwd()));
  } catch {
    return Response.json({ message: "图片清理失败，文件未全部删除" }, { status: 400 });
  }
}
