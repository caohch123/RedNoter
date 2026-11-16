import { NextResponse } from "next/server";
import { errorResponse, parseCredentials, sessionResponse } from "@/lib/mock/http";
import { checkCredentials } from "@/lib/mock/store";

// MOCK：POST /api/auth/login
export async function POST(request: Request) {
  const parsed = await parseCredentials(request);
  if (parsed instanceof NextResponse) {
    // 登录时不暴露具体的格式规则，统一提示账号或密码错误
    return errorResponse(401, "INVALID_CREDENTIALS", "用户名或密码错误");
  }
  const user = await checkCredentials(parsed.username, parsed.password);
  if (!user) {
    return errorResponse(401, "INVALID_CREDENTIALS", "用户名或密码错误");
  }
  return sessionResponse(user, 200);
}
