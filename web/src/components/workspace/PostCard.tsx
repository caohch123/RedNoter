/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Post } from "@/lib/collections";

export function PostImage({ src, alt, cover = false }: { src: string; alt: string; cover?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">图片暂不可用</div>;
  return <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setFailed(true)}
    className={"h-full w-full " + (cover ? "object-cover" : "object-contain")} />;
}

export function PostDetail({ post, actions, onClose, initialImageIndex = 0 }: {
  post: Post; actions: ReactNode; onClose: () => void; initialImageIndex?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const startIndex = Math.max(0, Math.min((post.images?.length ?? 1) - 1, initialImageIndex));
  const [index, setIndex] = useState(startIndex);
  const images = post.images ?? [];

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    if (gallery.current) gallery.current.scrollLeft = gallery.current.clientWidth * startIndex;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [startIndex]);

  function goTo(next: number) {
    const element = gallery.current;
    if (!element) return;
    const bounded = Math.max(0, Math.min(images.length - 1, next));
    element.scrollTo({ left: element.clientWidth * bounded, behavior: "smooth" });
  }

  return (
    <dialog ref={dialog} aria-label={"帖子详情：" + post.title}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft") { event.preventDefault(); goTo(index - 1); }
        if (event.key === "ArrowRight") { event.preventDefault(); goTo(index + 1); }
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[min(1100px,94vw)] max-w-none overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50">
      <div className="sticky top-0 z-20 flex justify-end bg-white/95 px-4 py-2">
        <button type="button" autoFocus onClick={onClose} aria-label="关闭帖子详情"
          className="rounded-full px-3 py-2 text-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900">×</button>
      </div>
      <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="relative min-w-0 bg-slate-100">
          {images.length ? (
            <>
              <div ref={gallery} role="region" aria-label="帖子图片，可左右滑动"
                className="flex h-[50dvh] snap-x snap-mandatory overflow-x-auto overscroll-x-contain md:h-[70dvh]"
                onScroll={event => {
                  const element = event.currentTarget;
                  if (element.clientWidth) setIndex(Math.max(0, Math.min(images.length - 1, Math.round(element.scrollLeft / element.clientWidth))));
                }}>
                {images.map((src, position) => (
                  <div key={src} role="group" aria-label={"第 " + (position + 1) + " 张，共 " + images.length + " 张"}
                    className="h-full w-full shrink-0 snap-center">
                    <PostImage src={src} alt={post.title + " · 图片 " + (position + 1)} />
                  </div>
                ))}
              </div>
              {images.length > 1 && <>
                <button type="button" aria-label="上一张图片" disabled={index === 0} onClick={() => goTo(index - 1)}
                  className="absolute left-3 top-1/2 rounded-full bg-white/90 px-3 py-2 text-xl text-slate-700 shadow-sm disabled:opacity-25">‹</button>
                <button type="button" aria-label="下一张图片" disabled={index === images.length - 1} onClick={() => goTo(index + 1)}
                  className="absolute right-3 top-1/2 rounded-full bg-white/90 px-3 py-2 text-xl text-slate-700 shadow-sm disabled:opacity-25">›</button>
              </>}
              <p aria-live="polite" className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">{index + 1} / {images.length}</p>
            </>
          ) : <div className="flex h-60 items-center justify-center text-slate-500">这篇帖子没有图片</div>}
        </div>
        <div className="min-w-0 p-6">
          <p className="text-sm text-slate-500">{post.author}</p>
          <h2 className="mt-4 break-words text-2xl font-bold">{post.title}</h2>
          <p className="mt-5 whitespace-pre-wrap break-words leading-7 text-slate-700">{post.content || "暂无正文"}</p>
          {!!post.tags?.length && (
            <ul aria-label="原帖话题标签" className="mt-4 flex flex-wrap gap-2">
              {Array.from(new Set(post.tags.map(tag => tag.trim()).filter(Boolean))).map(tag => (
                <li key={tag} className="max-w-full break-words rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-600">
                  #{tag.replace(/^#+/, "")}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-sm text-brand-600">点赞：{post.likes}</p>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </div>
    </dialog>
  );
}

export function PostCard({ post, actions, badge }: { post: Post; actions: ReactNode; badge?: string }) {
  const [open, setOpen] = useState(false);
  const firstImage = post.images?.[0];
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-200">
      <button type="button" onClick={() => setOpen(true)} aria-label={"查看帖子详情：" + post.title}
        className="block w-full text-left focus-visible:outline-2 focus-visible:outline-brand-400">
        <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
          {firstImage
            ? <PostImage key={firstImage} src={firstImage} alt={post.title} cover />
            : <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-6"><span className="line-clamp-6 text-xl font-semibold leading-relaxed text-slate-800">{post.title}</span></div>}
          {badge && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">{badge}</span>}
          {(post.images?.length ?? 0) > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">{post.images!.length} 张图片</span>}
        </div>
        <div className="p-4">
          <h2 className="line-clamp-2 text-base font-semibold leading-6 text-slate-900">{post.title}</h2>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-500">
            <span className="truncate">{post.author}</span><span className="shrink-0">♡ {post.likes}</span>
          </div>
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">{actions}</div>
      {open && <PostDetail post={post} actions={actions} onClose={() => setOpen(false)} />}
    </article>
  );
}
