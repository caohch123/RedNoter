import "server-only";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  type ApiErrorCode,
  type Credentials,
  type User,
} from "@/lib/api/types";
import { validatePassword, validateUsername } from "@/lib/validation";
import { createSessionToken } from "./store";

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
) {
  return NextResponse.json({ code, message }, { status });
}

/** 解析并校验 { username, password }；不合法时返回 400 响应 */
export async function parseCredentials(
  request: Request,
): Promise<Credentials | NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const problem = validateUsername(username) ?? validatePassword(password);
  if (problem) return errorResponse(400, "VALIDATION_ERROR", problem);
  return { username, password };
}

export function sessionResponse(user: User, status: number) {
  const res = NextResponse.json({ user }, { status });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
