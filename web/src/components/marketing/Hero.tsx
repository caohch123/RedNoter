import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { btnGhost, btnPrimary } from "@/components/ui/styles";
import { HeroDemo } from "./HeroDemo";

const POINTS = ["原创 / 仿写双模式", "话题与素材持续沉淀", "用户名 + 密码即可注册"];

export function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-brand-200">
            <span className="h-1.5 w-1.5 animate-twinkle rounded-full bg-star-300" />
            AI 驱动的小红书内容创作工作台
          </span>
          <h1 className="mt-6 text-[36px] font-bold leading-[1.18] tracking-tight text-white sm:text-[48px] lg:text-[56px]">
            每一篇爆款笔记，
            <br />
            都是等你<span className="text-starlight">摘下的星</span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-slate-300">
            摘星帮你追踪热门话题、沉淀爆款素材，再用 AI
            把灵感写成能发布的小红书笔记。从「写什么」到「发出去」，都在同一片星空下完成。
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link className={`${btnPrimary} px-5 py-3.5 text-sm`} href="/register">
              免费注册，开始摘星
              <ArrowRight size={17} />
            </Link>
            <Link className={`${btnGhost} px-5 py-3.5 text-sm`} href="/login">
              已有账号，登录
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            {POINTS.map((point) => (
              <li key={point} className="inline-flex items-center gap-1.5">
                <CircleCheck className="text-emerald-400" size={15} />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <HeroDemo />
      </div>
    </section>
  );
}
