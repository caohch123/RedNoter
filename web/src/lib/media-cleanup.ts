import { readSavedPosts } from "@/lib/collections";
import { getPendingImages, readImportedPosts, setPendingImages } from "@/lib/imported-posts";

// 清理失败保留队列，后续可重试；每次发送前重新读取帖子和收藏。
export async function cleanupPendingImages(): Promise<number> {
  const posts = [...readImportedPosts(), ...readSavedPosts()];
  const protectedImages = new Set(posts.flatMap(post => post.images ?? []));
  const candidates = getPendingImages().filter(image => !protectedImages.has(image));
  if (!candidates.length) return 0;
  const response = await fetch("/api/media/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates: candidates.slice(0, 500) }),
  });
  if (!response.ok) throw new Error("图片清理失败，请稍后点击重试。");
  const result: { completed: string[]; deleted: number; failed: number } = await response.json();
  const completed = new Set(result.completed);
  setPendingImages(getPendingImages().filter(image => !completed.has(image)));
  if (result.failed) throw new Error("部分图片暂时无法删除，请稍后重试。");
  return result.deleted;
}
