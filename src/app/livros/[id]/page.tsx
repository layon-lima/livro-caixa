import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { ExplorerShell, type Titular } from "@/components/explorer-shell";
import { categorias, titularesPermitidos, safeId, type Operacao } from "@/lib/document-data";
import { OperationRows } from "@/components/operation-rows";
import { ExpenseSpreadsheet } from "@/components/expense-spreadsheet";
import { Folder, Search } from "lucide-react";
export const dynamic="force-dynamic";

type Attached = {operacao_id:string;arquivo_id:string;nome_original:string;documento_tipo:string};
type Params = {aba?:string;mes?:string;categoria?:string;q?:string;op?:string;erro?:string};
export default async function Livro({params,searchParams}:{
  params:Promise<{id:string}>; searchParams:Promise<Params>;
}){
  const user=await requireUser();
  const id=safeId((await params).id);
  if(!id||!await canAccessTitular(user,id,"view"))notFound();
  const query=await searchParams;
  const spreadsheet=query.aba==="planilha";
  const db=getDatabase();
  const [titles,cats]=await Promise.all([
    db.query<Titular>("SELECT id::text AS id,nome FROM titulares WHERE id=$1",[id]),
    categorias(),
  ]);
  const selected=titles.rows[0];if(!selected)notFound();
  const books=user.isAdmin
    ?await db.query<Titular>("SELECT id::text,nome FROM titulares ORDER BY nome")
    :await db.query<Titular>(
        "SELECT t.id::text,t.nome FROM titulares t JOIN user_titular_permissions p ON p.titular_id=t.id "+
        "WHERE p.user_id=$1 AND p.can_view=TRUE ORDER BY t.nome",[user.id]);
  const q=String(query.q||"").trim().slice(0,200);
  const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(query.mes||"")?query.mes:null;
  const category=safeId(query.categoria);
  const data=await db.query<Operacao>(
    "SELECT o.id::text,o.titular_id::text,o.titulo,o.competencia::text,o.categoria_id::text,"+
    "c.nome AS categoria,c.subcategoria,o.tipo,o.descricao,o.contraparte,o.referencia,o.valor::text,o.criado_em::text,o.excluido_em::text,"+
    "(SELECT count(*)::text FROM operacao_arquivos oa WHERE oa.operacao_id=o.id) AS quantidade_documentos "+
    "FROM operacoes o LEFT JOIN categorias c ON c.id=o.categoria_id WHERE o.titular_id=$1 AND o.excluido_em IS NULL "+
    "AND ($2::text IS NULL OR to_char(o.competencia,'YYYY-MM')=$2) "+
    "AND ($3::bigint IS NULL OR o.categoria_id=$3) "+
    "AND ($4::text IS NULL OR o.titulo ILIKE '%'||$4||'%' OR o.descricao ILIKE '%'||$4||'%' "+
    "OR o.contraparte ILIKE '%'||$4||'%' OR o.referencia ILIKE '%'||$4||'%' OR "+
    "EXISTS (SELECT 1 FROM operacao_arquivos oa JOIN arquivos a ON a.id=oa.arquivo_id "+
    "WHERE oa.operacao_id=o.id AND (a.texto_extraido ILIKE '%'||$4||'%' OR a.nome_original ILIKE '%'||$4||'%'))) "+
    "ORDER BY o.competencia DESC,o.id DESC LIMIT 500",
    [id,month,category,q||null]);
  const ops=data.rows;
  const attached=await db.query<Attached>(
    "SELECT oa.operacao_id::text,oa.arquivo_id::text,a.nome_original,p.documento_tipo "+
    "FROM operacao_arquivos oa JOIN arquivos a ON a.id=oa.arquivo_id "+
    "JOIN propostas p ON p.id=oa.proposta_id "+
    "JOIN operacoes o ON o.id=oa.operacao_id WHERE o.titular_id=$1 AND o.excluido_em IS NULL ORDER BY oa.proposta_id",
    [id]);
  const all=await db.query<{competencia:string;categoria_id:string|null;nome:string|null}>(
    "SELECT DISTINCT to_char(o.competencia,'YYYY-MM') AS competencia,o.categoria_id::text,c.nome "+
    "FROM operacoes o LEFT JOIN categorias c ON c.id=o.categoria_id WHERE o.titular_id=$1 AND o.excluido_em IS NULL "+
    "ORDER BY competencia DESC,nome",[id]);
  const years=new Map<string,Map<string,{id:string|null;nome:string|null}[]>>();
  for(const row of all.rows){
    const year=row.competencia.slice(0,4);
    if(!years.has(year))years.set(year,new Map());
    const map=years.get(year)!;
    if(!map.has(row.competencia))map.set(row.competencia,[]);
    map.get(row.competencia)!.push({id:row.categoria_id,nome:row.nome});
  }
  const folder=<div className="folder-tree">
    {[...years.entries()].map(([year,months])=><details key={year} open>
      <summary><Folder size={14} className="folder-icon"/>{year}</summary>
      {[...months.entries()].map(([m,sections])=><details key={m} open={month===m}>
        <summary><Folder size={14} className="folder-icon"/>{new Intl.DateTimeFormat("pt-BR",{month:"long"}).format(new Date(m+"-01T12:00:00"))}</summary>
        {sections.map(s=><Link className="folder-leaf" key={s.id||"none"}
          href={"/livros/"+id+"?mes="+m+(s.id?"&categoria="+s.id:"")}>
          <Folder size={13} className="folder-icon"/>{s.nome||"Sem categoria"}
        </Link>)}
      </details>)}
    </details>)}
  </div>;
  const [canEdit,canDelete,editBooks]=await Promise.all([
    canAccessTitular(user,id,"edit"),canAccessTitular(user,id,"delete"),
    titularesPermitidos(user,"edit")
  ]);
  return <ExplorerShell user={user} titulares={books.rows} selected={selected}
    folderContent={folder} operationCount={ops.length} tabBookId={String(id)}
    activeTab={spreadsheet?"planilha":"explorador"}>
    {spreadsheet?<ExpenseSpreadsheet bookId={String(id)} cats={cats}
      books={editBooks} canEdit={canEdit} canDelete={canDelete}
      months={[...new Set(all.rows.map(r=>r.competencia))]}/> : <>
    {query.erro==="arquivo-compartilhado"&&<p className="form-error" role="alert">Esta operação contém arquivos compartilhados com outros lançamentos. Para evitar misturar documentos, o movimento foi bloqueado.</p>}
    <div className="list-toolbar">
      <form action={"/livros/"+id} className="search-bar">
        <Search size={15}/>
        <input name="q" defaultValue={q} placeholder="Pesquisar operações e conteúdo OCR"/>
        <button type="submit">Pesquisar</button>
      </form>
      <form action={"/livros/"+id} className="filter-bar">
        <input type="hidden" name="q" value={q}/>
        <select name="mes" defaultValue={month||""} aria-label="Filtrar competência">
          <option value="">Todos os meses</option>
          {[...new Set(all.rows.map(r=>r.competencia))].map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <select name="categoria" defaultValue={category||""} aria-label="Filtrar categoria">
          <option value="">Todas as categorias</option>
          {cats.map(c=><option key={c.id} value={c.id}>{c.nome}{c.subcategoria?" → "+c.subcategoria:""}</option>)}
        </select>
        <button type="submit">Filtrar</button>
      </form>
    </div>
    <div className="file-columns" aria-hidden="true">
      <div className="col-main">Operação</div><div className="col-category">Categoria</div>
      <div className="col-period">Competência</div><div className="col-docs">Documentos</div>
    </div>
    <OperationRows operations={ops} documents={attached.rows} books={editBooks}
      canEdit={canEdit} canDelete={canDelete} bookId={String(id)}/>
    </>}
  </ExplorerShell>;
}
