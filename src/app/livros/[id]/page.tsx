import { notFound } from "next/navigation";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { ExplorerShell, type Titular } from "@/components/explorer-shell";
export const dynamic = "force-dynamic";

export default async function Livro({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const titularId = Number(id);
  if (!Number.isSafeInteger(titularId) || titularId < 1 || !(await canAccessTitular(user, titularId, "view"))) {
    notFound();
  }

  const db = getDatabase();
  const rows = await db.query<Titular>(
    "SELECT id::text AS id, nome FROM titulares WHERE id=$1", [titularId],
  );
  const selected = rows.rows[0];
  if (!selected) notFound();
  const livres = user.isAdmin
    ? await db.query<Titular>("SELECT id::text AS id,nome FROM titulares ORDER BY nome")
    : await db.query<Titular>(
        "SELECT t.id::text AS id,t.nome FROM titulares t " +
        "JOIN user_titular_permissions p ON p.titular_id=t.id " +
        "WHERE p.user_id=$1 AND p.can_view=TRUE ORDER BY t.nome", [user.id],
      );
  return <ExplorerShell user={user} titulares={livres.rows} selected={selected} />;
}
