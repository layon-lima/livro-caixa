import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { Trash2, ArrowLeft } from "lucide-react";
import { TrashRows } from "@/components/trash-rows";
export const dynamic = "force-dynamic";

export default async function Lixeira() {
  const user=await requireUser();
  const db=getDatabase();
  const rows=await db.query<{id:string;titulo:string;nome:string;competencia:string}>(
    "SELECT o.id::text,o.titulo,t.nome,o.competencia::text FROM operacoes o JOIN titulares t ON t.id=o.titular_id "+
    (user.isAdmin?"":"JOIN user_titular_permissions p ON p.titular_id=o.titular_id AND p.user_id=$1 AND p.can_delete=true ")+
    "WHERE o.excluido_em IS NOT NULL ORDER BY o.excluido_em DESC LIMIT 200",
    user.isAdmin?[]:[user.id]);
  return <div className="work-page">
    <header className="work-bar"><Link href="/"><ArrowLeft size={16}/> Livros Caixa</Link><strong><Trash2 size={16}/> Lixeira</strong></header>
    <main className="work-main">
      <h1 className="work-heading">Operações excluídas</h1>
      <p className="muted">Selecione uma operação e dê dois cliques para abrir as ações.</p>
      <TrashRows items={rows.rows}/>
    </main>
  </div>;
}
