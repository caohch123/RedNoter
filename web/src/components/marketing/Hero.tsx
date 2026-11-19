import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StarMark } from "@/components/ui/Logo";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import { HeroWall } from "./HeroWall";

/** 依次出现的动画延迟（秒） */
const at = (s: number) => ({ animationDelay: `${s}s` });

/** 首屏：画面交给照片墙，文字只留一句标题、一句话和两个按钮 */
export function Hero() {
  return (
    <HeroWall>
      <div className="flex flex-col items-center text-center">
        {/* 标题：墨色渐变 + 纸面高光 + 一层很淡的投影；每隔一会儿有一道暖光扫过 */}
        <h1 className="font-serif text-[42px] font-medium leading-[1.2] tracking-[0.01em] [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))_drop-shadow(0_18px_28px_rgba(60,42,24,0.12))] sm:text-[60px] lg:text-[76px]">
          <span className="hero-rise block" style={at(0.35)}>
            <span className="ink-sheen">每一篇爆款笔记，</span>
          </span>
          <span className="hero-rise block" style={at(0.5)}>
            <span className="ink-sheen" style={{ animationDelay: "2.7s" }}>
              都是等你
            </span>
            <span className="relative inline-block">
              <span className="ink-star">摘下的星</span>
              {/* 「星」字右上角一颗会闪的小星光 */}
              <span aria-hidden="true" className="twinkle absolute -right-[0.38em] -top-[0.1em] text-brand-400">
                <StarMark size={20} />
              </span>
              {/* 手写感的下划线，入场时画出来 */}
              <svg
                aria-hidden="true"
                className="absolute -bottom-[0.18em] left-0 h-[0.32em] w-full overflow-visible text-brand-500"
                preserveAspectRatio="none"
                viewBox="0 0 200 20"
              >
                <path
                  className="hero-draw"
                  d="M3 14 C 45 4, 110 4, 197 11"
                  fill="none"
                  pathLength={1}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="5"
                  style={at(1.1)}
                />
              </svg>
            </span>
          </span>
        </h1>

        <p className="hero-rise mt-7 text-[17px] text-ink-500 sm:text-xl" style={at(0.7)}>
          追热点、存素材、写笔记，一个工作台就够了。
        </p>

        <div className="hero-rise mt-9 flex flex-wrap items-center justify-center gap-3" style={at(0.85)}>
          <Link className={`${btnPrimary} group px-6 py-3.5 text-[15px]`} href="/register">
            免费开始创作
            <ArrowRight className="transition group-hover:translate-x-0.5" size={16} />
          </Link>
          <Link className={`${btnSecondary} px-6 py-3.5 text-[15px]`} href="#try">
            先试一试
          </Link>
        </div>
      </div>
    </HeroWall>
  );
}
