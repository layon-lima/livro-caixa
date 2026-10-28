import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { createSessionToken, SESSION_COOKIE, tokenDigest } from "@/lib/auth";
import { sameOriginPost } from "@/lib/request-security";
import { verifyPassword } from "@/lib/passwords";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOriginPost(request)) return new Response("Origem inválida", { status: 403 });
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const failure = () => new NextResponse(null, { status: 303, headers: { Location: "/login?error=1", "Cache-Control": "no-store" } });
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length > 128 || password.length === 0) return failure();

  const db = getDatabase();
  const found = await db.query<{
    id: string; password_hash: string; is_active: boolean; locked: boolean;
  }>(
    "SELECT id::text AS id, password_hash, is_active, " +
    "(locked_until IS NOT NULL AND locked_until > now()) AS locked " +
    "FROM users WHERE username=$1 LIMIT 1",
    [username],
  );
  const user = found.rows[0];
  if (!user || !user.is_active || user.locked) return failure();

  if (!(await verifyPassword(password, user.password_hash))) {
    await db.query(
      "UPDATE users SET failed_attempts = " +
      "CASE WHEN locked_until IS NOT NULL AND locked_until < now() THEN 1 ELSE failed_attempts + 1 END, " +
      "locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until < now() THEN 1 ELSE failed_attempts + 1 END) >= 8 " +
      "THEN now() + interval '15 minutes' ELSE locked_until END WHERE id=$1",
      [user.id],
    );
    return failure();
  }

  await db.query("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1", [user.id]);
  const token = createSessionToken();
  const maxAge = 60 * 60 * 24 * 7;
  await db.query(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now()+interval '7 days')",
    [tokenDigest(token), user.id],
  );

  const response = new NextResponse(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge,
  });
  return response;
}
