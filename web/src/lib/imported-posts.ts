import { cleanPostContent, isImagePath } from "@/lib/post-content";
import type { Post } from "@/lib/collections";

export const MAX_TRACKED_POSTS = 100;
const KEY = "rednoter:imported-posts";
const PENDING_IMAGES_KEY = "rednoter:pending-image-cleanup";

export function getPendingImages(): string[] {
  const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_IMAGES_KEY) ?? "[]");
  if (!Array.isArray(parsed) || !parsed.every(isImagePath)) throw new Error("待清理图片数据格式错误");
  return parsed;
}

export function setPendingImages(images: string[]) {
  localStorage.setItem(PENDING_IMAGES_KEY, JSON.stringify([...new Set(images)]));
}

export function parseImportedPosts(text: string): Post[] {
  const data: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (!Array.isArray(data)) throw new Error("文件最外层必须是帖子数组。");
  const posts = data.map((item: unknown, index): Post => {
    if (typeof item !== "object" || item === null) throw new Error(`第 ${index + 1} 条不是帖子对象。`);
    const p = item as Record<string, unknown>;
    if (
      typeof p.id !== "string" || !p.id.trim() ||
      typeof p.title !== "string" || !p.title.trim() ||
      typeof p.author !== "string" || !p.author.trim() ||
      typeof p.content !== "string" ||
      typeof p.likes !== "number" || !Number.isSafeInteger(p.likes) || p.likes < 0
    ) throw new Error(`第 ${index + 1} 条格式不正确：需要非空 id、title、author，字符串 content，以及非负整数 likes。`);
    if (p.images !== undefined && (!Array.isArray(p.images) || !p.images.every(isImagePath))) throw new Error("图片路径格式不正确。");
    if (p.tags !== undefined && (!Array.isArray(p.tags) || !p.tags.every(tag => typeof tag === "string"))) throw new Error("标签格式不正确。");
    return { images: p.images as string[] | undefined, tags: p.tags as string[] | undefined, id: p.id.trim(), title: p.title.trim(), author: p.author.trim(), content: cleanPostContent(p.content), likes: p.likes };
  });
  if (new Set(posts.map(post => post.id)).size !== posts.length) throw new Error("文件内存在重复帖子 ID，请先去重。");
  return posts;
}

export function mergeImportedPosts(existing: Post[], incoming: Post[]): Post[] {
  const byId = new Map(existing.map(post => [post.id, post]));
  incoming.forEach(post => byId.set(post.id, post));
  // 更新已有 ID 保留原加入顺序；超出时淘汰最早加入的帖子。
  return [...byId.values()].slice(-MAX_TRACKED_POSTS);
}

export function readImportedPosts(): Post[] {
  const text = localStorage.getItem(KEY);
  if (text === null) return [];
  const parsed = parseImportedPosts(text);
  const retained = mergeImportedPosts([], parsed);
  if (parsed.length > MAX_TRACKED_POSTS) saveImportedPosts(retained);
  return retained;
}

export function saveImportedPosts(posts: Post[]) {
  const retained = mergeImportedPosts([], posts);
  const previousText = localStorage.getItem(KEY);
  const previous = previousText === null ? [] : parseImportedPosts(previousText);
  const used = new Set(retained.flatMap(post => post.images ?? []));
  const unused = [...previous, ...posts].flatMap(post => post.images ?? []).filter(image => !used.has(image));
  // 先排队后保存；若帖子写入失败，清理时会再读取旧帖子保护其图片。
  setPendingImages([...getPendingImages(), ...unused]);
  localStorage.setItem(KEY, JSON.stringify(retained));
}
