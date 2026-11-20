"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { FadeImage as Image } from "@/components/ui/FadeImage";
import { StarMark } from "@/components/ui/Logo";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import { HERO_POSTS, SHOWCASE_NOTES, type Post } from "@/lib/marketing/showcase";
import { TitleIdeas } from "./TitleIdeas";

/** 照片墙用到的全部笔记（首屏卡片 + 作品展示），按列错开分配 */
const WALL_POSTS: Post[] = [...HERO_POSTS, ...SHOWCASE_NOTES];
const COLUMN_COUNT = 7;
const COLUMNS = Array.from({ length: COLUMN_COUNT }, (_, c) => WALL_POSTS.filter((_, i) => i % COLUMN_COUNT === c));
/** 每列滚完一轮的秒数，彼此错开，看起来不机械 */
const DURATIONS = [64, 78, 56, 70, 60, 82, 68];
/** 卡片比例交替，形成瀑布流的错落感 */
const RATIOS = ["aspect-[3/4]", "aspect-[4/5]", "aspect-[3/4]", "aspect-[1/1]"];

/**
 * 首屏：一整面缓缓流动的小红书照片墙，略微倾斜，像在翻一个装满灵感的信息流。
 * - 奇数列向上、偶数列向下，速度各不相同；鼠标停在某一列上，这一列会停下；
 * - 中间一圈柔光让标题清楚，四周照片铺满屏幕，手机上也一样；
 * - 点任意一张照片「摘下这颗星」，弹窗给出同主题的几种标题写法；
 * - 开启「减少动态效果」时照片墙不滚动。
 */
export function HeroWall({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  const [picked, setPicked] = useState<Post | null>(null);

  function pick(post: Post) {
    window.clearTimeout(clearTimer.current);
    setPicked(post);
    dialogRef.current?.showModal();
  }

  return (
    <section className="relative isolate flex min-h-[max(600px,calc(100svh-4rem))] items-center justify-center overflow-hidden px-6 py-20">
      {/* 照片墙：外层负责入场淡入，内层负责倾斜 */}
      <div aria-hidden="true" className="hero-wall-in pointer-events-none absolute inset-0 -z-20 flex items-center justify-center [perspective:1600px]">
        <div className="flex gap-3 [transform:rotateX(18deg)_rotateZ(-12deg)_scale(1.3)] sm:gap-5">
          {COLUMNS.map((column, c) => (
            <div
              key={c}
              className={`wall-col flex w-[118px] shrink-0 flex-col sm:w-[172px] lg:w-[196px] ${c % 2 ? "wall-col-down" : ""}`}
              style={{ "--wall-duration": `${DURATIONS[c]}s` } as CSSProperties}
            >
              {/* 内容排两遍，平移 -50% 后无缝衔接；用下边距而不是 gap，周期才严丝合缝 */}
              {[...column, ...column].map((post, i) => (
                <button
                  key={`${post.id}-${i}`}
                  className="group pointer-events-auto mb-3 block cursor-pointer sm:mb-5"
                  onClick={() => pick(post)}
                  tabIndex={-1}
                  type="button"
                >
                  <span
                    className={`relative block ${RATIOS[(c + i) % RATIOS.length]} overflow-hidden rounded-[14px] bg-sand-100 shadow-card ring-1 ring-ink-900/5 transition duration-500 group-hover:-translate-y-1 group-hover:shadow-float`}
                  >
                    <Image alt="" className="object-cover" fill loading="eager" sizes="(min-width: 1024px) 200px, 180px" src={post.image} />
                    <span className="absolute inset-x-2 bottom-2 flex translate-y-1 items-center justify-center gap-1 rounded-full bg-white/90 py-1.5 text-[11px] font-medium text-ink-900 opacity-0 backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                      <StarMark className="text-brand-500" size={10} />
                      摘下这颗星
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/*
        柔光：中间一圈纸色把照片「推远」，让标题清楚；上下边缘渐隐，和导航、下一屏自然衔接。
        手机上柔光更扁更宽，照片露在标题的上方和下方。
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_115%_34%_at_50%_50%,rgba(250,249,245,1)_52%,rgba(250,249,245,0.82)_70%,rgba(250,249,245,0)_100%),linear-gradient(to_bottom,rgba(250,249,245,1)_0%,rgba(250,249,245,0)_16%,rgba(250,249,245,0)_84%,rgba(250,249,245,1)_100%)] md:bg-[radial-gradient(ellipse_50%_44%_at_50%_50%,rgba(250,249,245,1)_50%,rgba(250,249,245,0.85)_68%,rgba(250,249,245,0)_100%),linear-gradient(to_bottom,rgba(250,249,245,1)_0%,rgba(250,249,245,0)_14%,rgba(250,249,245,0)_86%,rgba(250,249,245,1)_100%)]"
      />

      <div className="relative max-w-[760px]">{children}</div>

      <dialog
        ref={dialogRef}
        aria-label="摘下这颗星"
        className="m-auto w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl bg-paper p-0 shadow-2xl outline-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        onClose={() => {
          // 等关闭过渡播完再清空内容，避免弹窗先变空白再消失
          clearTimer.current = window.setTimeout(() => setPicked(null), 300);
        }}
      >
        {picked && <PickedStar post={picked} onClose={() => dialogRef.current?.close()} />}
      </dialog>
    </section>
  );
}

/** 「摘下这颗星」弹窗：原笔记 + 换个写法 */
function PickedStar({ post, onClose }: { post: Post; onClose: () => void }) {
  return (
    <div className="grid max-h-[88vh] overflow-y-auto md:grid-cols-[0.85fr_1.15fr]">
      <div className="relative aspect-[4/3] bg-sand-100 md:aspect-auto md:min-h-[480px]">
        <Image alt={post.title} className="object-cover" fill sizes="(min-width: 768px) 340px, 100vw" src={post.image} />
      </div>
      <div className="flex flex-col p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 font-hand text-base text-ink-700">
            <StarMark className="animate-[pick-spin_0.8s_cubic-bezier(0.2,0.7,0.2,1)_both] text-brand-500" size={16} />
            你摘下了一颗星
          </p>
          <button
            aria-label="关闭"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition hover:bg-sand-100 hover:text-ink-900"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <h3 className="mt-4 font-serif text-2xl font-medium leading-snug ink-print">{post.title}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
          <span className="relative h-4 w-4 overflow-hidden rounded-full">
            <Image alt="" className="object-cover" fill sizes="32px" src={post.avatar} />
          </span>
          {post.author}
          <Heart className="ml-2" size={12} />
          {post.likes}
        </p>

        <div className="mt-7 border-t border-ink-900/10 pt-5">
          <p className="text-sm text-ink-700">想写同样的主题？先给你三个方向：</p>
          <div className="mt-3">
            <TitleIdeas topic={post.topic} />
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-7">
          <Link className={`${btnPrimary} px-4 py-2.5 text-sm`} href="/register">
            注册，用它来仿写
          </Link>
          <button className={`${btnSecondary} px-4 py-2.5 text-sm`} onClick={onClose} type="button">
            再摘一颗
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-400">示例作品；标题方向由规则生成，登录后 AI 会结合你的素材来写。</p>
      </div>
    </div>
  );
}
