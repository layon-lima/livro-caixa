import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, tokenDigest } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { sameOriginPost } from "@/lib/request-security";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!sameOriginPost(request)) return new Response("Origem inválida", { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await getDatabase().query("DELETE FROM user_sessions WHERE token_hash=$1", [tokenDigest(token)]);
  }
  const response = new NextResponse(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 0,
  });
  return response;
}
