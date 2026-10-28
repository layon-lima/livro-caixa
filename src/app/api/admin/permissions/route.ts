import { currentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime = "nodejs";

const keys = ["view", "import", "approve", "edit", "delete"] as const;

export async function POST(request: Request) {
  if (!sameOriginPost(request)) return forbidden();
  const admin = await currentUser();
  if (!admin?.isAdmin) return forbidden();
  const form = await request.formData();
  const userId = Number(form.get("userId"));
  if (!Number.isSafeInteger(userId) || userId < 1) return backTo("/admin?error=dados");

  const db = getDatabase();
  const target = await db.query<{ is_admin: boolean }>(
    "SELECT is_admin FROM users WHERE id=$1", [userId],
  );
  if (!target.rows[0] || target.rows[0].is_admin) return forbidden();

  const titulares = await db.query<{ id: string }>("SELECT id::text AS id FROM titulares");
  const connection = await db.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("DELETE FROM user_titular_permissions WHERE user_id=$1", [userId]);
    for (const titular of titulares.rows) {
      const values = keys.map(key => form.get("p_" + titular.id + "_" + key) === "on");
      // Permissão de ação implica permissão de visualização do livro.
      const [view, imp, approve, edit, del] = values;
      const canView = view || imp || approve || edit || del;
      if (!canView) continue;
      await connection.query(
        "INSERT INTO user_titular_permissions " +
        "(user_id,titular_id,can_view,can_import,can_approve,can_edit,can_delete) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7)",
        [userId, titular.id, canView, imp, approve, edit, del],
      );
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  return backTo("/admin?saved=1");
}
