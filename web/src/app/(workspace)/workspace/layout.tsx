import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { CreationSketchToggle, CreationThemeToggle } from "@/components/creation/CreationThemeToggle";
import { HeaderDoodles } from "@/components/creation/StudioDoodles";
import { CurrentUserProvider } from "@/components/workspace/CurrentUser";
import { UserMenu } from "@/components/workspace/UserMenu";
import { UserPreferencesProvider } from "@/components/workspace/UserPreferencesContext";
import { CreationHeaderNav } from "@/components/workspace/CreationHeaderNav";
import { WorkspaceNav } from "@/components/workspace/WorkspaceNav";
import styles from "./layout.module.css";

export const metadata: Metadata = { title: "创作工作区" };

/**
 * 工作区外壳：登录后才能访问（见 src/proxy.ts）。
 * 这里只提供顶部导航和当前用户，不限制内容宽度 ——
 * 每个模块页面自己决定容器（原型里 AI 创作用 1480px，其余用 1240px）。
 */
export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return (
    <CurrentUserProvider>
      <UserPreferencesProvider>
        <div className={`flex min-h-screen flex-col bg-slate-50 text-slate-900 ${styles.shell}`}>
          <header className={`sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md ${styles.hostHeader}`}>
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
          <header className={styles.creationHeader}>
            <HeaderDoodles className={styles.headerDoodles} />
            <div className={styles.headerRow}>
              <Link href="/workspace" className={styles.brand} aria-label="摘星工作区">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand-icon.png" alt="" width={30} height={30} className={styles.brandIcon} />
                <strong>摘星</strong><small>创作台</small>
              </Link>
              <Suspense fallback={<nav aria-label="创作台导航" />}>
                <CreationHeaderNav />
              </Suspense>
              <div className={styles.account}>
                <CreationSketchToggle className={`${styles.themeToggle} ${styles.sketchToggle}`} />
                <CreationThemeToggle className={styles.themeToggle} />
                <UserMenu />
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </div>
      </UserPreferencesProvider>
    </CurrentUserProvider>
  );
}
