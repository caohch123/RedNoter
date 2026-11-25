"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { useCurrentUser } from "./CurrentUser";
import { useUserPreferences } from "./UserPreferencesContext";

/** 右上角的当前用户设置入口与退出登录 */
export function UserMenu() {
  const user = useCurrentUser();
  const { openSettings } = useUserPreferences();
  const router = useRouter();

  async function logout() {
    await authApi.logout().catch(() => undefined);
    router.replace("/");
  }

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <button
          type="button"
          data-user-settings-trigger=""
          title="打开工作区设置"
          aria-label="打开工作区设置"
          onClick={() => openSettings()}
          className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          <span
            data-user-avatar=""
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600"
          >
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">{user.username}</span>
          <Settings size={13} className="opacity-60 transition group-hover:opacity-100" aria-hidden="true" />
        </button>
      ) : (
        <span aria-hidden="true" className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
      )}
      <button
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        onClick={logout}
        type="button"
      >
        <LogOut size={14} />
        退出登录
      </button>
    </div>
  );
}
