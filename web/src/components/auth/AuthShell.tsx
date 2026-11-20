import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandTick } from "@/components/ui/HandMarks";
import { LeafShadow } from "@/components/ui/LeafShadow";
import { Logo, StarMark } from "@/components/ui/Logo";
import { AuthForm, type AuthMode } from "./AuthForm";

const VALUES = [
  { title: "原创 / 仿写双模式", desc: "配置参数直接生成，或拆解高收藏笔记后改写。" },
  { title: "话题追踪 + 素材库", desc: "热门话题持续汇入，好内容按话题分组收好。" },
  { title: "发布管理", desc: "草稿箱、待发布、已发布，进度一目了然。" },
];

/** 登录 / 注册页：左侧表单，右侧产品价值 */
export function AuthShell({ mode }: { mode: AuthMode }) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-2">
      <main className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Logo />
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-500 transition hover:text-ink-900"
            href="/"
          >
            <ArrowLeft size={15} />
            返回首页
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 pt-4 sm:px-8">
          <div className="w-full max-w-[400px]">
            <AuthForm initialMode={mode} />
          </div>
        </div>
      </main>

      <aside className="hidden p-3 lg:block">
        <div className="grain relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-sand-100 p-12 xl:p-16">
          {/* 和首页一样的窗边暖光与树影 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_100%_0%,rgba(255,226,182,0.55),rgba(255,226,182,0)_70%)]"
          />
          <LeafShadow className="right-0 top-0 h-[75%] w-full" />
          <StarMark className="relative text-brand-500" size={32} />
          <div className="relative max-w-md">
            <h2 className="font-serif text-[36px] font-medium leading-[1.3] tracking-[0.01em] ink-print xl:text-[42px]">
              把灵感，写成一篇
              <br />
              能发布的小红书笔记
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-ink-500">
              从追踪话题到定稿发布，摘星把整条创作链路放进同一个工作台。你负责判断，重复劳动交给 AI。
            </p>
            <ul className="mt-10 space-y-5 border-t border-ink-900/10 pt-8">
              {VALUES.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <HandTick className="mt-0.5 shrink-0 text-brand-500" size={20} />
                  <div>
                    <p className="text-[15px] font-medium text-ink-900">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-ink-500">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-ink-400">© 2026 摘星</p>
        </div>
      </aside>
    </div>
  );
}
