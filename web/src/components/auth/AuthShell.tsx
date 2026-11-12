import Link from "next/link";
import { ArrowLeft, ClipboardList, Flame, WandSparkles } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { SpaceBackdrop } from "@/components/ui/SpaceBackdrop";
import { AuthForm, type AuthMode } from "./AuthForm";

const VALUES = [
  {
    icon: WandSparkles,
    tint: "bg-brand-500/15 text-brand-200",
    title: "原创 / 仿写双模式",
    desc: "配置参数直接生成，或拆解高收藏笔记后改写。",
  },
  {
    icon: Flame,
    tint: "bg-cyan-400/10 text-cyan-300",
    title: "话题追踪 + 素材库",
    desc: "热门话题和笔记持续汇入，素材结构化沉淀。",
  },
  {
    icon: ClipboardList,
    tint: "bg-emerald-400/10 text-emerald-300",
    title: "发布管理",
    desc: "草稿箱、待发布、已发布，进度一目了然。",
  },
];

/** 登录 / 注册页的整体布局：左侧品牌价值，右侧表单 */
export function AuthShell({ mode }: { mode: AuthMode }) {
  return (
    <div className="relative isolate grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <SpaceBackdrop galaxyScale={1.1} galaxyX={0.5} galaxyY={0.52} />

      {/* 品牌侧 */}
      <aside className="relative hidden overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <Logo />
        <div className="my-10 max-w-xl">
          <h2 className="text-[34px] font-bold leading-[1.22] tracking-tight text-white xl:text-[40px]">
            把灵感，写成一篇
            <br />
            <span className="text-starlight">能发布</span>的小红书笔记。
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
            从追踪话题到定稿发布，摘星把整条创作链路放进同一个工作台。你负责判断，重复劳动交给
            AI。
          </p>
          <ul className="mt-8 space-y-3">
            {VALUES.map((item) => (
              <li key={item.title} className="glass spotlight flex items-start gap-3 rounded-2xl px-4 py-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${item.tint}`}>
                  <item.icon size={16} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[10px] text-slate-500">© 2026 摘星</p>
      </aside>

      {/* 表单侧 */}
      <main className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <div className="lg:hidden">
            <Logo badge={false} size="sm" />
          </div>
          <Link
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            href="/"
          >
            <ArrowLeft size={14} />
            返回首页
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-2 sm:px-8">
          <div className="w-full max-w-[420px]">
            <AuthForm initialMode={mode} />
          </div>
        </div>
      </main>
    </div>
  );
}
