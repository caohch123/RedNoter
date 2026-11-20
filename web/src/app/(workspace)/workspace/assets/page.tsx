"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PostCard, PostDetail, PostImage } from "@/components/workspace/PostCard";
import { readSavedPosts, saveSavedPosts, type Post } from "@/lib/collections";

type MaterialSection = "posts" | "titles" | "content" | "images";
const sections: { id: MaterialSection; label: string }[] = [
  { id: "posts", label: "原帖" },
  { id: "titles", label: "标题" },
  { id: "content", label: "正文" },
  { id: "images", label: "图片" },
];
const secondaryButton = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-400";

export default function Page() {
  const router = useRouter();
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [section, setSection] = useState<MaterialSection>("posts");
  const [preview, setPreview] = useState<{ post: Post; imageIndex: number } | null>(null);

  useEffect(() => {
    try {
      // 浏览器存储需要在挂载后读取，避免服务端渲染时访问 localStorage。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedPosts(readSavedPosts());
    } catch {
      setStorageError("读取收藏失败，请检查本地存储或收藏数据。");
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 四个分区都来自完整收藏，取消原帖收藏后，其拆分素材也会一起消失。
  const titlePosts = savedPosts.filter(post => post.title.trim());
  const contentPosts = savedPosts.filter(post => post.content.trim());
  const images = savedPosts.flatMap(post =>
    (post.images ?? []).map((src, imageIndex) => ({ post, src, imageIndex }))
  );
  const counts: Record<MaterialSection, number> = {
    posts: savedPosts.length,
    titles: titlePosts.length,
    content: contentPosts.length,
    images: images.length,
  };
  const emptyMessages: Record<MaterialSection, string> = {
    posts: "暂无收藏，先去话题追踪页面收藏一篇帖子吧。",
    titles: "收藏的帖子中暂无标题素材。",
    content: "收藏的帖子中暂无正文素材，只有话题标签的帖子不会出现在这里。",
    images: "收藏的帖子中暂无图片素材。",
  };

  function handleRewrite(content: string) {
    if (!content.trim()) return;
    try {
      sessionStorage.setItem("rednoter:rewrite-source", content);
    } catch {
      setStorageError("无法传递文案，请检查浏览器是否允许本地存储。");
      return;
    }
    router.push("/workspace/create");
  }

  function removeFromLibrary(postId: string) {
    try {
      const nextPosts = savedPosts.filter(post => post.id !== postId);
      saveSavedPosts(nextPosts);
      setSavedPosts(nextPosts);
      if (preview?.post.id === postId) setPreview(null);
      setStorageError("");
    } catch {
      setStorageError("取消收藏失败，请重试。");
    }
  }

  function originalButton(post: Post) {
    return <button type="button" className={secondaryButton}
      onClick={() => setPreview({ post, imageIndex: 0 })}>查看原帖</button>;
  }

  function cancelButton(post: Post) {
    return <button type="button" className={secondaryButton}
      onClick={() => removeFromLibrary(post.id)}>取消收藏</button>;
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10">
      <h1 className="text-3xl font-bold text-slate-900">素材库</h1>
      <p className="mt-3 text-slate-500">
        收藏后自动整理标题、正文和图片，在原帖中查看详情或取消收藏。
      </p>

      <div role="group" aria-label="素材分区" className="mt-8 flex flex-wrap gap-2">
        {sections.map(item => (
          <button key={item.id} type="button" aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
            className={"rounded-xl px-5 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-400 " +
              (section === item.id ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {item.label}{isLoaded ? "（" + counts[item.id] + "）" : ""}
          </button>
        ))}
      </div>

      {storageError && <p role="alert" className="mt-4 text-red-600">{storageError}</p>}

      {!isLoaded ? <p className="mt-8 text-slate-500">正在读取收藏……</p> : (
        <section aria-label={sections.find(item => item.id === section)!.label + "素材"}>
          <p aria-live="polite" className="mt-6 text-sm text-slate-500">
            {section === "posts" && "共收藏 " + counts.posts + " 篇帖子"}
            {section === "titles" && "共 " + counts.titles + " 条标题素材"}
            {section === "content" && "共 " + counts.content + " 条正文素材，可带入 AI 创作进行仿写"}
            {section === "images" && "共 " + counts.images + " 张图片，点击图片可放大并浏览同一原帖的其他图片"}
          </p>
          {counts[section] === 0 ? (
            <p className="mt-8 text-slate-500">{emptyMessages[section]}</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section === "posts" && savedPosts.map(post => (
                <PostCard key={post.id} post={post} actions={cancelButton(post)} />
              ))}

              {section === "titles" && titlePosts.map(post => (
                <article key={post.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="whitespace-pre-wrap break-words text-lg font-semibold text-slate-900 [overflow-wrap:anywhere]">{post.title}</h2>
                  <p className="mt-4 truncate text-sm text-slate-500">作者：{post.author}</p>
                  <div className="mt-4">{originalButton(post)}</div>
                </article>
              ))}

              {section === "content" && contentPosts.map(post => (
                <article key={post.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words leading-7 text-slate-700 [overflow-wrap:anywhere]">{post.content}</p>
                  <p className="mt-4 truncate text-sm text-slate-500">作者：{post.author}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleRewrite(post.content)}
                      className="rounded-xl bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-brand-400">用于仿写</button>
                    {originalButton(post)}
                  </div>
                </article>
              ))}

              {section === "images" && images.map(({ post, src, imageIndex }) => (
                <article key={post.id + ":" + imageIndex} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setPreview({ post, imageIndex })}
                    aria-label={"放大图片：" + post.title + "，第 " + (imageIndex + 1) + " 张"}
                    className="block aspect-[3/4] w-full overflow-hidden bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-400">
                    <PostImage src={src} alt={post.title + " · 图片 " + (imageIndex + 1)} cover />
                  </button>
                  <div className="p-4">
                    <h2 className="line-clamp-2 break-words text-sm text-slate-700">{post.title}</h2>
                    <p className="mt-2 text-sm text-slate-500">原帖图片 {imageIndex + 1} / {post.images!.length}</p>
                    <div className="mt-3">{originalButton(post)}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {preview && <PostDetail key={preview.post.id + ":" + preview.imageIndex} post={preview.post}
        initialImageIndex={preview.imageIndex} actions={cancelButton(preview.post)} onClose={() => setPreview(null)} />}
    </main>
  );
}
