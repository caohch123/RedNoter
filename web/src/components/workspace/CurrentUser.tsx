"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

const CurrentUserContext = createContext<User | null>(null);

/**
 * 工作区内共享的当前用户：整个工作区只请求一次 /auth/me。
 * 会话失效（401）时清掉 cookie 并回到登录页；网络错误等其他失败不会把人踢出去。
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(async (error: unknown) => {
        if (cancelled) return;
        if (!(error instanceof ApiError) || error.status !== 401) return;
        await authApi.logout().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        router.replace(`/login?next=${next}`);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <CurrentUserContext value={user}>{children}</CurrentUserContext>;
}

/** 工作区模块里获取当前登录用户；还在加载时返回 null */
export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
