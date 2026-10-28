import Link from "next/link";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { titularesPermitidos } from "@/lib/document-data";
import { getDatabase } from "@/lib/database";
import { physicalStorageBytes, STORAGE_LIMIT_BYTES } from "@/lib/storage-actions";
import { ImportDrop } from "@/components/import-drop";
import { ImportStatusRefresh } from "@/components/import-status-refresh";
import { FileUp, ArrowLeft, ClipboardCheck } from "lucide-react";
export const dynamic="force-dynamic";

export default async function Importar({searchParams}:{searchParams:Promise<{titular?:string}>}) {
  const user=await requireUser();
  const books=await titularesPermitidos(user,"import");
  const query=await searchParams;
  const selected=books.find(x=>x.id===query.titular)||books[0];
  const canApprove=selected?await canAccessTitular(user,Number(selected.id),"approve"):false;
  const [list, usedBytes]=await Promise.all([
    getDatabase().query<{
    id:string;nome_original:string;status:string;erro:string|null;criado_em:string;nome:string;revisado:boolean;
  }>(
    "SELECT a.id::text,a.nome_original,a.status,a.erro,a.criado_em::text,t.nome,"+
    "EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND (p.revisada_em IS NOT NULL OR p.aprovado_em IS NOT NULL)) AS revisado "+
    "FROM arquivos a JOIN titulares t ON t.id=a.titular_envio_id "+
    (user.isAdmin?"":"JOIN user_titular_permissions p ON p.titular_id=a.titular_envio_id AND p.user_id=$1 AND p.can_import=true ")+
    "ORDER BY a.id DESC LIMIT 100",
    user.isAdmin?[]:[user.id],
  ),
    physicalStorageBytes(),
  ]);
  const percent=Math.min(100,(usedBytes/STORAGE_LIMIT_BYTES)*100);
  const gb=(bytes:number)=>(bytes/1_000_000_000).toLocaleString("pt-BR",{maximumFractionDigits:2});
  return <div className="work-page">
    <header className="work-bar"><Link href="/" className="work-back"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><FileUp size={17}/> Importação</strong><Link href="/conferencia">Conferência <ClipboardCheck size={15}/></Link></header>
    <main className="work-main">
      <div className="page-title-compact"><h1>Importar documentos</h1><span>Leitura e conferência automática</span></div>
      <p className="muted">Solte os arquivos para iniciar a leitura OCR e a interpretação pela IA Central. Você confere e aprova.</p>
      <section className="storage-meter" aria-label="Espaço usado pelos documentos">
        <div className="storage-meter-caption">
          <strong>Documentos compactados na VPS</strong>
          <span>{gb(usedBytes)} GB usados de 20 GB ({percent.toFixed(1).replace(".",",")}%)</span>
        </div>
        <div className="storage-meter-track" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{width:percent+"%"}}/>
        </div>
        <small>Limite de 20 GB para arquivos compactados. O banco de dados e os temporários do OCR são separados.</small>
      </section>
      <details className="import-options">
        <summary>Opções de importação (opcional)</summary>
        <form action="/importar" className="form-row-compact">
          <label htmlFor="titular">Titular provisório, caso não seja identificado no documento:</label>
          <select name="titular" id="titular" defaultValue={selected?.id||""}>
            {books.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <button type="submit" className="flat-button">Aplicar</button>
        </form>
      </details>
      {selected?<ImportDrop key={selected.id} titularId={selected.id} canApprove={canApprove}/>
        :<p className="form-error">Este usuário não possui permissão de importação.</p>}
      <div className="page-title-compact"><h2>Arquivos recebidos</h2><span>Processamento automático na VPS</span></div>
      <ImportStatusRefresh active={list.rows.some(a=>a.status==="aguardando"||a.status==="processando")}/>
      <div className="table-scroll">
        <table className="admin-table dense-table">
          <thead><tr><th>Arquivo</th><th>Titular</th><th>Situação</th><th>Recebido em</th></tr></thead>
          <tbody>{list.rows.map(a=><tr key={a.id}>
            <td>{a.nome_original}</td><td>{a.nome}</td><td>
              {a.status==="erro"?<span title={a.erro||""}>Erro — {a.erro?.slice(0,100)}</span>:a.status}
              {(a.status==="erro" || (a.status==="pronto" && !a.revisado)) && <form className="inline-retry" action="/api/importar/reprocessar" method="post">
                <input type="hidden" name="arquivoId" value={a.id}/>
                <button type="submit" className="flat-button">Reprocessar</button>
              </form>}
            </td>
            <td>{new Date(a.criado_em).toLocaleString("pt-BR")}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="muted">Depois que o OCR terminar, a conferência do lote abre automaticamente para quem tem permissão de aprovar. Arquivos não conferidos podem ser reprocessados sem novo envio.</p>
    </main>
  </div>;
}
