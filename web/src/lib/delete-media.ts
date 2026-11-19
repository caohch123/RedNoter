import { lstat, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { isImagePath } from "@/lib/post-content";

// 只删除指定目录中符合采集命名格式的普通文件，不接受任意磁盘路径。
export async function deleteMedia(candidates: string[], projectRoot: string) {
  if (candidates.length > 500 || !candidates.every(isImagePath)) {
    throw new Error("无效图片清理请求");
  }
  const publicRoot = path.resolve(projectRoot, "public");
  const mediaRoot = path.join(publicRoot, "imported-media");
  const completed: string[] = [];
  let deleted = 0;
  let failed = 0;
  try {
    const publicStat = await lstat(publicRoot);
    const mediaStat = await lstat(mediaRoot);
    if (publicStat.isSymbolicLink() || mediaStat.isSymbolicLink() || !mediaStat.isDirectory()) {
      throw new Error("图片目录不能是链接");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { completed: [...new Set(candidates)], deleted: 0, failed: 0 };
    }
    throw error;
  }
  const resolvedRoot = await realpath(mediaRoot);
  for (const image of new Set(candidates)) {
    const target = path.resolve(mediaRoot, path.basename(image));
    if (path.dirname(target) !== mediaRoot) throw new Error("图片路径超出允许目录");
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || path.dirname(await realpath(target)) !== resolvedRoot) {
        failed++;
        continue;
      }
      await unlink(target);
      completed.push(image);
      deleted++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") completed.push(image);
      else failed++;
    }
  }
  return { completed, deleted, failed };
}
