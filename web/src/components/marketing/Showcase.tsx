"use client";

import { useRef, useState, type PointerEvent } from "react";
import { FadeImage as Image } from "@/components/ui/FadeImage";
import Link from "next/link";
import { Bookmark, Heart, MessageCircle, X } from "lucide-react";
import { btnPrimary } from "@/components/ui/styles";
import { SHOWCASE_NOTES, type ShowcaseNote } from "@/lib/marketing/showcase";
import { TitleIdeas } from "./TitleIdeas";

const ALL = "全部";
const FILTERS = [ALL, ...Array.from(new Set(SHOWCASE_NOTES.map((n) => n.category)))];

const RATIO: Record<ShowcaseNote["ratio"], string> = {
  "3/4": "aspect-[3/4]",
  "4/5": "aspect-[4/5]",
  "1/1": "aspect-square",
};

/**
 * 照片悬停：跟着鼠标微微倾斜，表面一块柔光跟着移动，像在手里翻一张光面相纸。
 * 只响应鼠标；开启「减少动态效果」时不动。
 */
function tiltMove(e: PointerEvent<HTMLDivElement>) {
  if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`);
  el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
  el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
}

function tiltLeave(e: PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
}

function Avatar({ src, size }: { src: string; size: number }) {
  return (
    <span className="relative shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
      <Image alt="" className="object-cover" fill sizes={`${size * 2}px`} src={src} />
    </span>
  );
}

/** 作品展示：小红书式的瀑布流，可按类目筛选，点开看完整笔记 */
export function Showcase() {
  const [filter, setFilter] = useState(ALL);
  const [open, setOpen] = useState<ShowcaseNote | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clearTimer = useRef<number | undefined>(undefined);

  const notes = filter === ALL ? SHOWCASE_NOTES : SHOWCASE_NOTES.filter((n) => n.category === filter);
  const hasSamples = SHOWCASE_NOTES.some((n) => n.sample);

  function show(note: ShowcaseNote) {
    window.clearTimeout(clearTimer.current);
    setOpen(note);
    dialogRef.current?.showModal();
  }

  return (
    <section className="grain scroll-mt-16 bg-white" id="showcase">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:py-32">
        {/* 标题靠左、筛选靠右：和上下几屏的居中标题错开，版面更有节奏 */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl" data-reveal>
          <h2 className="font-serif text-[32px] font-medium leading-tight tracking-[0.01em] ink-print sm:text-[46px]">
            用摘星写出来的笔记
          </h2>
          <p className="mt-4 text-lg leading-8 text-ink-500">
            旅行、穿搭、美食、家居……什么都能写。点开任意一篇，看看它是怎么写出来的。
          </p>
        </div>

        <div aria-label="按类目筛选" className="-mx-3.5 flex flex-wrap gap-x-1 gap-y-2 lg:mx-0 lg:justify-end" data-reveal role="group">
          {FILTERS.map((name) => (
            <button
              key={name}
              aria-pressed={filter === name}
              className={`relative px-3.5 py-2 text-[15px] transition ${
                filter === name ? "text-ink-900" : "text-ink-400 hover:text-ink-700"
              }`}
              onClick={() => setFilter(name)}
              type="button"
            >
              {name}
              <span
                className={`absolute inset-x-3.5 -bottom-0.5 h-px bg-ink-900 transition-transform duration-300 ${
                  filter === name ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          ))}
        </div>
        </div>

        <ul key={filter} className="mt-12 columns-2 gap-5 md:columns-3 lg:columns-4">
          {notes.map((note, i) => (
            // 切换筛选时卡片依次浮现
            <li key={note.id} className="mb-6 animate-fade-in break-inside-avoid" style={{ animationDelay: `${i * 45}ms` }}>
              <button
                className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-900"
                onClick={() => show(note)}
                type="button"
              >
                <div
                  className={`relative ${RATIO[note.ratio]} w-full overflow-hidden rounded-xl bg-sand-100 transition-[transform,box-shadow] duration-500 ease-out [transform:perspective(900px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] group-hover:shadow-float`}
                  onPointerLeave={tiltLeave}
                  onPointerMove={tiltMove}
                >
                  <Image
                    alt={note.title}
                    className="object-cover group-hover:scale-[1.03]"
                    fill
                    sizes="(min-width: 1024px) 290px, (min-width: 768px) 33vw, 50vw"
                    src={note.image}
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-ink-900/[0.06]" />
                  {/* 跟着鼠标走的一块柔光 */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(circle at var(--gx, 50%) var(--gy, 0%), rgba(255, 248, 236, 0.42), rgba(255, 248, 236, 0) 55%)",
                    }}
                  />
                </div>
                <p className="mt-2.5 line-clamp-2 text-sm font-medium leading-snug text-ink-900">{note.title}</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
                  <Avatar size={18} src={note.avatar} />
                  <span className="truncate">{note.author}</span>
                  <Heart className="ml-auto shrink-0" size={13} />
                  <span>{note.likes}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {hasSamples && (
          <p className="mt-4 text-center text-xs text-ink-400">
            以上为示例作品：图片来自 Unsplash 免费图库，文字、昵称和数据由团队编写，不是真实用户发布的内容。
          </p>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-label={open?.title}
        className="m-auto w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-2xl bg-white p-0 shadow-2xl outline-none"
        onClick={(e) => {
          // 点遮罩关闭
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        onClose={() => {
          // 等关闭过渡播完再清空内容
          clearTimer.current = window.setTimeout(() => setOpen(null), 300);
        }}
      >
        {open && (
          <div className="grid max-h-[88vh] md:grid-cols-[1.1fr_1fr]">
            <div className="relative aspect-[4/3] bg-sand-100 md:aspect-auto md:min-h-[560px]">
              <Image alt={open.title} className="object-cover" fill sizes="(min-width: 768px) 470px, 100vw" src={open.image} />
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2.5 border-b border-ink-900/5 px-5 py-3.5">
                <Avatar size={32} src={open.avatar} />
                <span className="text-sm text-ink-900">{open.author}</span>
                <span className="ml-2 rounded-full border border-brand-500 px-3 py-0.5 text-xs text-brand-600">关注</span>
                <button
                  aria-label="关闭"
                  className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition hover:bg-sand-100 hover:text-ink-900"
                  onClick={() => dialogRef.current?.close()}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <h3 className="font-serif text-xl font-medium leading-snug ink-print">{open.title}</h3>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-ink-700">{open.body}</p>
                <p className="mt-3 text-[15px] text-sky-800">{open.tags.map((t) => `#${t}`).join(" ")}</p>
                <div className="mt-6">
                  <p className="text-xs text-ink-400">同一个主题，换个写法</p>
                  <div className="mt-2">
                    <TitleIdeas count={2} topic={open.topic} />
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-paper p-4">
                  <p className="text-xs text-ink-400">这篇是怎么写出来的</p>
                  <p className="mt-1 text-sm leading-6 text-ink-900">
                    {open.mode === "原创"
                      ? "原创模式：填好类目、卖点、人群和语气，AI 直接生成初稿，再改两轮定稿。"
                      : "仿写模式：从话题库找到同类高收藏笔记，拆解开头和结构后换成自己的经历改写。"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 border-t border-ink-900/5 px-5 py-3.5 text-ink-500">
                <span className="flex items-center gap-1 text-sm">
                  <Heart size={18} />
                  {open.likes}
                </span>
                <Bookmark size={18} />
                <MessageCircle size={18} />
                <Link className={`${btnPrimary} ml-auto px-4 py-2 text-sm`} href="/register">
                  我也来写一篇
                </Link>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
