import type { Metadata } from "next";
import Link from "next/link";
import { Logo, StarMark } from "@/components/ui/Logo";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";

export const metadata: Metadata = { title: "页面不存在" };

/** 404：地址输错或页面还没做时显示，给一条回去的路 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="px-5 py-4 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <StarMark className="text-brand-500" size={32} />
        <p className="mt-6 text-sm text-ink-400">404</p>
        <h1 className="mt-3 font-serif text-[32px] font-medium tracking-[0.01em] ink-print sm:text-[42px]">
          这颗星还没有被点亮
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-7 text-ink-500">
          你要找的页面不存在，可能是地址输错了，或者这个页面还在开发中。
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link className={`${btnPrimary} px-5 py-3 text-[15px]`} href="/">
            回到首页
          </Link>
          <Link className={`${btnSecondary} px-5 py-3 text-[15px]`} href="/workspace">
            去工作区
          </Link>
        </div>
      </main>
    </div>
  );
}
