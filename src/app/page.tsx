import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { ExplorerShell, type Titular } from "@/components/explorer-shell";
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const db = getDatabase();
  const rows = user.isAdmin
    ? await db.query<Titular>("SELECT id::text AS id,nome FROM titulares ORDER BY nome")
    : await db.query<Titular>(
        "SELECT t.id::text AS id,t.nome FROM titulares t " +
        "JOIN user_titular_permissions p ON p.titular_id=t.id " +
        "WHERE p.user_id=$1 AND p.can_view=TRUE ORDER BY t.nome", [user.id],
      );
  return <ExplorerShell user={user} titulares={rows.rows} />;
}
