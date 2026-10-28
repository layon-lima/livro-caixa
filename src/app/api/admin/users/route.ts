import { currentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { hashPassword, validPassword } from "@/lib/passwords";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginPost(request)) return forbidden();
  const admin = await currentUser();
  if (!admin?.isAdmin) return forbidden();
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || !validPassword(password)) {
    return backTo("/admin?error=dados");
  }
  const hashed = await hashPassword(password);
  const inserted = await getDatabase().query(
    "INSERT INTO users(username,password_hash) VALUES($1,$2) ON CONFLICT(username) DO NOTHING RETURNING id",
    [username, hashed],
  );
  return backTo(inserted.rowCount ? "/admin?created=1" : "/admin?error=duplicado");
}
