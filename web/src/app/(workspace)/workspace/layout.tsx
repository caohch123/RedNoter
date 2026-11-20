import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/ui/Logo";
import { CurrentUserProvider } from "@/components/workspace/CurrentUser";
import { UserMenu } from "@/components/workspace/UserMenu";
import { WorkspaceNav } from "@/components/workspace/WorkspaceNav";

export const metadata: Metadata = { title: "创作工作区" };

/**
 * 工作区外壳：登录后才能访问（见 src/proxy.ts）。
 * 背景和原型的模块页一样用 bg-slate-50，原型搬过来可以直接用。
 * 这里只提供顶部导航和当前用户，不限制内容宽度 ——
 * 每个模块页面自己决定容器（原型里 AI 创作用 1480px，其余用 1240px）。
 */
export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return (
    <CurrentUserProvider>
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-6">
            <Logo href="/workspace" />
            <UserMenu />
          </div>
          <div className="mx-auto max-w-[1480px] px-4 pb-2 sm:px-5">
            <Suspense fallback={<div className="h-9" />}>
              <WorkspaceNav />
            </Suspense>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </CurrentUserProvider>
  );
}
