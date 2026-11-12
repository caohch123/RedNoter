import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/types";
import { errorResponse } from "@/lib/mock/http";
import { findUserById, readSessionToken } from "@/lib/mock/store";

// MOCK：GET /api/auth/me
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = readSessionToken(token);
  const user = userId ? await findUserById(userId) : null;
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "登录已失效，请重新登录");
  }
  return NextResponse.json({ user });
}
