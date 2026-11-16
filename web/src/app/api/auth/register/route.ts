import { NextResponse } from "next/server";
import { errorResponse, parseCredentials, sessionResponse } from "@/lib/mock/http";
import { createUser } from "@/lib/mock/store";

// MOCK：POST /api/auth/register（注册成功即视为已登录）
export async function POST(request: Request) {
  const parsed = await parseCredentials(request);
  if (parsed instanceof NextResponse) return parsed;

  const user = await createUser(parsed.username, parsed.password);
  if (!user) {
    return errorResponse(409, "USERNAME_TAKEN", "这个用户名已经被注册了");
  }
  return sessionResponse(user, 201);
}
