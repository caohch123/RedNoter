import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-space-950/60">
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo badge={false} />
            <p className="mt-4 max-w-xs text-xs leading-6 text-slate-400">
              AI 驱动的小红书内容创作工作台，把话题追踪、素材沉淀、AI
              创作与发布管理放在同一个地方。
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-white">了解产品</p>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-400">
              <li>
                <a className="transition hover:text-brand-200" href="#features">
                  产品能力
                </a>
              </li>
              <li>
                <a className="transition hover:text-brand-200" href="#flow">
                  创作流程
                </a>
              </li>
              <li>
                <a className="transition hover:text-brand-200" href="#why">
                  为什么是摘星
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-white">账号</p>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-400">
              <li>
                <Link className="transition hover:text-brand-200" href="/login">
                  登录
                </Link>
              </li>
              <li>
                <Link className="transition hover:text-brand-200" href="/register">
                  注册
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 摘星</p>
          <p>发布前请自行核对内容真实性与平台规范。</p>
        </div>
      </div>
    </footer>
  );
}
