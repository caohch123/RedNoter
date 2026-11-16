import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { btnPrimary } from "@/components/ui/styles";

const NAV = [
  { href: "#features", label: "产品能力" },
  { href: "#flow", label: "创作流程" },
  { href: "#why", label: "为什么是摘星" },
];

/** 官网导航：只做产品介绍和登录入口，不放工作区模块 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-space-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-6">
        <Logo />
        <nav aria-label="页面导航" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            href="/login"
          >
            登录
          </Link>
          <Link className={`${btnPrimary} px-3.5 py-2 text-sm`} href="/register">
            免费注册
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}
