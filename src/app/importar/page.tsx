import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { titularesPermitidos } from "@/lib/document-data";
import { getDatabase } from "@/lib/database";
import { physicalStorageBytes, STORAGE_LIMIT_BYTES } from "@/lib/storage-actions";
import { ImportDrop } from "@/components/import-drop";
import { ImportStatusRefresh } from "@/components/import-status-refresh";
import { ImportedFileRows } from "@/components/imported-file-rows";
import { suggestDocumentName } from "@/lib/document-name";
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
    progresso_dados:Record<string,string>|null;propostas_quantidade:number;
    titulo_detectado:string|null;documento_tipo:string|null;contraparte_detectada:string|null;
    descricao_detectada:string|null;pagamento_detectado:string|null;
    categoria_detectada:string|null;subcategoria_detectada:string|null;
    categoria_sugerida_nome:string|null;categoria_sugerida_subcategoria:string|null;
  }>(
    "SELECT a.id::text,a.nome_original,a.progresso_dados,a.status,a.erro,a.criado_em::text,t.nome,"+
    "first.titulo AS titulo_detectado,first.documento_tipo,first.contraparte AS contraparte_detectada,"+
    "first.descricao AS descricao_detectada,first.data_pagamento::text AS pagamento_detectado,"+
    "c.nome AS categoria_detectada,c.subcategoria AS subcategoria_detectada,"+
    "first.categoria_sugerida_nome,first.categoria_sugerida_subcategoria,"+
    "(SELECT count(*)::int FROM propostas pp WHERE pp.arquivo_id=a.id) AS propostas_quantidade,"+
    "EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND (p.revisada_em IS NOT NULL OR p.aprovado_em IS NOT NULL)) AS revisado "+
    "FROM arquivos a JOIN titulares t ON t.id=a.titular_envio_id "+
    "LEFT JOIN LATERAL (SELECT p.titulo,p.documento_tipo,p.contraparte,p.descricao,p.data_pagamento,"+
    "p.categoria_id,p.categoria_sugerida_nome,p.categoria_sugerida_subcategoria "+
    "FROM propostas p WHERE p.arquivo_id=a.id ORDER BY p.id LIMIT 1) first ON TRUE "+
    "LEFT JOIN categorias c ON c.id=first.categoria_id "+
    (user.isAdmin?"":"JOIN user_titular_permissions p ON p.titular_id=a.titular_envio_id AND p.user_id=$1 AND p.can_import=true ")+
    "ORDER BY a.id DESC LIMIT 100",
    user.isAdmin?[]:[user.id],
  ),
    physicalStorageBytes(),
  ]);
  // A coluna Arquivo acompanha a identificação do OCR ainda durante a leitura.
  // PDFs com vários documentos preservam o nome do conjunto.
  const namedFiles=list.rows.map(file=>{
    const preview=file.progresso_dados||{};
    return {...file,nome_sugerido:file.propostas_quantidade>1?file.nome_original:
      suggestDocumentName({
        originalName:file.nome_original,
        documentType:file.documento_tipo||preview.documento_tipo,
        title:file.titulo_detectado||preview.titulo,
        counterparty:file.contraparte_detectada||preview.contraparte,
        category:file.categoria_detectada||file.categoria_sugerida_nome||preview.categoria,
        subcategory:file.subcategoria_detectada||file.categoria_sugerida_subcategoria,
        description:file.descricao_detectada||preview.descricao,
        paymentDate:file.pagamento_detectado||preview.data_pagamento
      })
    };
  });
  const previous=await getDatabase().query<{id:string;nome_arquivo:string;criado_em:string}>(
    "SELECT id::text,nome_arquivo,criado_em::text FROM lotes_importacao "+
    (user.isAdmin?"":"WHERE enviado_por=$1 ")+
    "ORDER BY criado_em DESC LIMIT 3",user.isAdmin?[]:[user.id]);
  const percent=Math.min(100,(usedBytes/STORAGE_LIMIT_BYTES)*100);
  const gb=(bytes:number)=>(bytes/1_000_000_000).toLocaleString("pt-BR",{maximumFractionDigits:2});
  return <StandaloneWorkspace title="Importação" section="livros"><div className="work-page">
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
      {previous.rows.length>0&&<div className="batch-previous">
        <strong>Retomar conferência dos ZIPs</strong>
        {previous.rows.map(l=><Link key={l.id} href={"/conferencia?lote="+l.id}>
          {l.nome_arquivo}
        </Link>)}
      </div>}
      <div className="page-title-compact"><h2>Arquivos recebidos</h2><span>Processamento automático na VPS</span></div>
      <ImportStatusRefresh active={list.rows.some(a=>a.status==="aguardando"||a.status==="processando")}/>
      <ImportedFileRows files={namedFiles}/>
      <p className="muted">Depois que o OCR terminar, a conferência do lote abre automaticamente para quem tem permissão de aprovar. Arquivos não conferidos podem ser reprocessados sem novo envio.</p>
    </main>
  </div></StandaloneWorkspace>;
}
