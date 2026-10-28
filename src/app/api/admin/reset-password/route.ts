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
  const userId = Number(form.get("userId"));
  const password = String(form.get("password") || "");
  if (!Number.isSafeInteger(userId) || userId < 1 || !validPassword(password))
    return backTo("/admin?error=dados");

  const passwordHash = await hashPassword(password);
  const db = getDatabase();
  const connection = await db.connect();
  try {
    await connection.query("BEGIN");
    const updated = await connection.query(
      "UPDATE users SET password_hash=$1, failed_attempts=0, locked_until=NULL WHERE id=$2 RETURNING id",
      [passwordHash, userId],
    );
    if (!updated.rowCount) {
      await connection.query("ROLLBACK");
      return backTo("/admin?error=dados");
    }
    await connection.query("DELETE FROM user_sessions WHERE user_id=$1", [userId]);
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  return backTo("/admin?saved=1");
}
