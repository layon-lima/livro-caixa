import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { Trash2, ArrowLeft } from "lucide-react";
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
      <table className="admin-table dense-table">
        <thead><tr><th>Operação</th><th>Titular</th><th>Competência</th><th></th></tr></thead>
        <tbody>{rows.rows.map(o=><tr key={o.id}>
          <td>{o.titulo}</td><td>{o.nome}</td><td>{o.competencia.slice(0,7)}</td>
          <td><form action={"/api/operacoes/"+o.id} method="post">
            <input type="hidden" name="acao" value="restaurar"/>
            <button className="flat-button" type="submit">Restaurar</button>
          </form></td>
        </tr>)}</tbody>
      </table>
      {rows.rows.length===0&&<p className="muted">Nenhuma operação na lixeira.</p>}
    </main>
  </div>;
}
