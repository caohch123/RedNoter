import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/types";

/**
 * 官网与工作区的边界（乐观检查，只看有没有会话 cookie）：
 * - 没登录访问 /workspace/* → 跳到登录页，登录后再回来；
 * - 已登录访问 /login、/register → 直接进工作区。
 * 真正的鉴权在后端接口上，这里只负责跳转体验。
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/workspace") && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/workspace/:path*", "/login", "/register"],
};
