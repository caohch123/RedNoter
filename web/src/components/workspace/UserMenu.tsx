"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import type { User } from "@/lib/api/types";

/** 右上角的当前用户与退出登录。会话失效时清掉 cookie 并回到登录页。 */
export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(async () => {
        if (cancelled) return;
        await authApi.logout().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname);
        router.replace(`/login?next=${next}`);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await authApi.logout().catch(() => undefined);
    router.replace("/");
  }

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <span className="flex items-center gap-2 text-sm text-slate-200">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-bold text-white">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">{user.username}</span>
        </span>
      ) : (
        <span aria-hidden="true" className="h-8 w-24 animate-pulse rounded-full bg-white/10" />
      )}
      <button
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/5 hover:text-white"
        onClick={logout}
        type="button"
      >
        <LogOut size={14} />
        退出登录
      </button>
    </div>
  );
}
