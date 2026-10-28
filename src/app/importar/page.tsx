import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { titularesPermitidos } from "@/lib/document-data";
import { getDatabase } from "@/lib/database";
import { ImportDrop } from "@/components/import-drop";
import { FileUp, ArrowLeft, ClipboardCheck } from "lucide-react";
export const dynamic="force-dynamic";

export default async function Importar({searchParams}:{searchParams:Promise<{titular?:string}>}) {
  const user=await requireUser();
  const books=await titularesPermitidos(user,"import");
  const query=await searchParams;
  const selected=books.find(x=>x.id===query.titular)||books[0];
  const list=await getDatabase().query<{
    id:string;nome_original:string;status:string;erro:string|null;criado_em:string;nome:string;
  }>(
    "SELECT a.id::text,a.nome_original,a.status,a.erro,a.criado_em::text,t.nome FROM arquivos a JOIN titulares t ON t.id=a.titular_envio_id "+
    (user.isAdmin?"":"JOIN user_titular_permissions p ON p.titular_id=a.titular_envio_id AND p.user_id=$1 AND p.can_import=true ")+
    "ORDER BY a.id DESC LIMIT 100",
    user.isAdmin?[]:[user.id],
  );
  return <div className="work-page">
    <header className="work-bar"><Link href="/" className="work-back"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><FileUp size={17}/> Importação</strong><Link href="/conferencia">Conferência <ClipboardCheck size={15}/></Link></header>
    <main className="work-main">
      <div className="page-title-compact"><h1>Importar documentos</h1><span>OCR e aprovação na Conferência</span></div>
      <form action="/importar" className="form-row-compact">
        <label htmlFor="titular">Livro de destino:</label>
        <select name="titular" id="titular" defaultValue={selected?.id||""}>
          {books.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <button type="submit" className="flat-button">Selecionar</button>
      </form>
      {selected?<ImportDrop key={selected.id} titularId={selected.id}/>
        :<p className="form-error">Este usuário não possui permissão de importação.</p>}
      <div className="page-title-compact"><h2>Arquivos recebidos</h2><span>O processamento ocorre na VPS</span></div>
      <div className="table-scroll">
        <table className="admin-table dense-table">
          <thead><tr><th>Arquivo</th><th>Titular</th><th>Situação</th><th>Recebido em</th></tr></thead>
          <tbody>{list.rows.map(a=><tr key={a.id}>
            <td>{a.nome_original}</td><td>{a.nome}</td><td>{a.status==="erro"?<span title={a.erro||""}>Erro — {a.erro?.slice(0,100)}</span>:a.status}</td>
            <td>{new Date(a.criado_em).toLocaleString("pt-BR")}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="muted">Documentos enviados não entram automaticamente no Livro Caixa. Revise e aprove em Conferência.</p>
    </main>
  </div>;
}
