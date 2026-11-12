import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/ui/Logo";
import { SpaceBackdrop } from "@/components/ui/SpaceBackdrop";
import { UserMenu } from "@/components/workspace/UserMenu";
import { WorkspaceNav } from "@/components/workspace/WorkspaceNav";

export const metadata: Metadata = { title: "创作工作区" };

/** 工作区外壳：登录后才能访问（见 src/proxy.ts），各模块页面渲染在 children 里 */
export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <SpaceBackdrop galaxy={false} />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-space-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-6">
          <Logo href="/workspace" />
          <UserMenu />
        </div>
        <div className="mx-auto max-w-[1240px] px-4 pb-2 sm:px-5">
          <Suspense fallback={<div className="h-9" />}>
            <WorkspaceNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-10 sm:px-6">{children}</main>
    </div>
  );
}
