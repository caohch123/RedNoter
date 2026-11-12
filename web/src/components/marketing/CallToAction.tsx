import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StarMark } from "@/components/ui/Logo";
import { btnGhost, btnPrimary } from "@/components/ui/styles";

const INSIDE = ["AI 创作", "话题追踪", "素材库", "发布管理"];

export function CallToAction() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 pb-16 lg:pb-24">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-700/50 via-space-800 to-space-900 px-7 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative grid gap-9 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-star-300">
              现在出发
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              今晚，摘一颗属于你的星。
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              注册只需要一个用户名和密码。登录之后，你的创作工作区就在那里等你。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className={`${btnPrimary} px-5 py-3 text-sm`} href="/register">
                免费注册
                <ArrowRight size={16} />
              </Link>
              <Link className={`${btnGhost} px-5 py-3 text-sm`} href="/login">
                登录我的工作区
              </Link>
            </div>
          </div>
          <div className="glass rounded-2xl p-5">
            <p className="text-xs font-semibold text-white">登录后，工作区里有</p>
            <ul className="mt-4 grid grid-cols-2 gap-2.5">
              {INSIDE.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs font-medium text-slate-200"
                >
                  <span className="text-star-300">
                    <StarMark size={12} />
                  </span>
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
