import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { SpaceBackdrop } from "@/components/ui/SpaceBackdrop";
import { btnGhost, btnPrimary } from "@/components/ui/styles";

export const metadata: Metadata = { title: "页面不存在" };

/** 404：地址输错或页面还没做时显示，给一条回去的路 */
export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <SpaceBackdrop galaxyScale={1.1} galaxyX={0.5} galaxyY={0.82} />
      <header className="px-5 py-4 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="text-starlight text-7xl font-bold tracking-tight sm:text-8xl">404</p>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          这片星域还没有被点亮
        </h1>
        <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">
          你要找的页面不存在，可能是地址输错了，或者这个页面还在开发中。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link className={`${btnPrimary} px-5 py-3 text-sm`} href="/">
            回到首页
            <ArrowRight size={16} />
          </Link>
          <Link className={`${btnGhost} px-5 py-3 text-sm`} href="/workspace">
            去工作区
          </Link>
        </div>
      </main>
    </div>
  );
}
