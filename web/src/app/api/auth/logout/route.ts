import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/types";

// MOCK：POST /api/auth/logout
export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
