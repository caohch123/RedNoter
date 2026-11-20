"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { useCurrentUser } from "./CurrentUser";

/** 右上角的当前用户与退出登录 */
export function UserMenu() {
  const user = useCurrentUser();
  const router = useRouter();

  async function logout() {
    await authApi.logout().catch(() => undefined);
    router.replace("/");
  }

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <span className="flex items-center gap-2 text-sm text-slate-700">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">{user.username}</span>
        </span>
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
