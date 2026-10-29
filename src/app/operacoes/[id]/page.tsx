import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { categorias, titularesPermitidos, safeId, type Operacao } from "@/lib/document-data";
import { ArrowLeft, FileText, Pencil } from "lucide-react";
export const dynamic="force-dynamic";
export default async function Editar({params}:{params:Promise<{id:string}>}){
  const user=await requireUser();
  const id=safeId((await params).id);if(!id)notFound();
  const db=getDatabase();
  const data=await db.query<Operacao>(
    "SELECT id::text,titular_id::text,titulo,competencia::text,data_pagamento::text,categoria_id::text,tipo,descricao,contraparte,referencia,valor::text,excluido_em::text "+
    "FROM operacoes WHERE id=$1",[id]);
  const op=data.rows[0];
  if(!op||!await canAccessTitular(user,Number(op.titular_id),"view"))notFound();
  const [cats,books,files]=await Promise.all([
    categorias(),titularesPermitidos(user,"edit"),
    db.query<{arquivo_id:string;nome_original:string}>(
      "SELECT oa.arquivo_id::text,a.nome_original FROM operacao_arquivos oa JOIN arquivos a ON a.id=oa.arquivo_id "+
      "WHERE oa.operacao_id=$1",[id]),
  ]);
  const editable=await canAccessTitular(user,Number(op.titular_id),"edit");
  return <StandaloneWorkspace title="Editar operação" section="livros"><div className="work-page">
    <header className="work-bar"><Link href={"/livros/"+op.titular_id}><ArrowLeft size={16}/> Voltar ao livro</Link><strong><Pencil size={16}/> Operação #{id}</strong></header>
    <main className="work-main narrow-work">
      <h1 className="work-heading">Editar operação</h1>
      <form action={"/api/operacoes/"+id} method="post" className="review-form">
        <div className="form-inline-two">
          <label>Titular
          <select value={op.titular_id} disabled>
            {books.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <input type="hidden" name="titularId" value={op.titular_id}/>
        </label>
          <label>Competência<input type="month" name="competencia" defaultValue={op.competencia.slice(0,7)} disabled={!editable}/></label>
          <label>Data do pagamento<input type="date" name="dataPagamento" defaultValue={op.data_pagamento||""} disabled={!editable}/></label>
        </div>
        <label>Título<input name="titulo" defaultValue={op.titulo} required maxLength={170} disabled={!editable}/></label>
        <div className="form-inline-two">
          <label>Categoria<select name="categoriaId" defaultValue={op.categoria_id||""} disabled={!editable}>
            <option value="">Sem categoria</option>
            {cats.map(c=><option value={c.id} key={c.id}>{c.nome}{c.subcategoria?" → "+c.subcategoria:""}</option>)}
          </select></label>
          <label>Tipo<select name="tipo" defaultValue={op.tipo==="receita"?"outro":op.tipo} disabled={!editable}>
            <option value="despesa">Despesa</option><option value="outro">Outro</option>
          </select></label>
        </div>
        <div className="form-inline-two">
          <label>Contraparte<input name="contraparte" defaultValue={op.contraparte} disabled={!editable}/></label>
          <label>Valor (informativo)<input name="valor" defaultValue={op.valor||""} disabled={!editable}/></label>
        </div>
        <label>Referência<input name="referencia" defaultValue={op.referencia} disabled={!editable}/></label>
        <label>Descrição<textarea name="descricao" defaultValue={op.descricao} rows={3} disabled={!editable}/></label>
        {editable&&<button className="primary-btn" type="submit">Salvar alterações</button>}
      </form>
      <h2 className="work-heading">Documentos vinculados</h2>
      {files.rows.map(f=><div className="upload-file-row" key={f.arquivo_id}>
        <a href={"/api/documentos/"+f.arquivo_id} target="_blank" rel="noreferrer"><FileText size={14}/>{f.nome_original}</a>
      </div>)}
      {files.rows.length===0&&<p className="muted">Nenhum documento vinculado.</p>}
    </main>
  </div></StandaloneWorkspace>;
}
