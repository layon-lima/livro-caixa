import { notFound } from "next/navigation";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { ExplorerShell, type Titular } from "@/components/explorer-shell";
import { categorias, titularesPermitidos, safeId } from "@/lib/document-data";
import {tagsDisponiveis} from "@/lib/tags";
import { ExpenseSpreadsheet } from "@/components/expense-spreadsheet";

export const dynamic="force-dynamic";

type Params={mes?:string;categoria?:string;recebedor?:string;q?:string;erro?:string};

export default async function Livro({params,searchParams}:{
  params:Promise<{id:string}>;searchParams:Promise<Params>;
}){
  const user=await requireUser();
  const id=safeId((await params).id);
  if(!id||!await canAccessTitular(user,id,"view"))notFound();

  const db=getDatabase();
  const query=await searchParams;
  const [title,books,cats,tags,months,editBooks,canEdit,canDelete]=await Promise.all([
    db.query<Titular>("SELECT id::text,nome FROM titulares WHERE id=$1 AND ativo=TRUE",[id]),
    user.isAdmin
      ?db.query<Titular>("SELECT id::text,nome FROM titulares WHERE ativo=TRUE ORDER BY nome")
      :db.query<Titular>(
        "SELECT t.id::text,t.nome FROM titulares t "+
        "JOIN user_titular_permissions p ON p.titular_id=t.id "+
        "WHERE p.user_id=$1 AND p.can_view=TRUE AND t.ativo=TRUE ORDER BY t.nome",[user.id]),
    categorias(),
    tagsDisponiveis(),
    db.query<{mes:string}>(
      "SELECT DISTINCT to_char(o.competencia,'YYYY-MM') AS mes FROM operacoes o "+
      "WHERE o.titular_id=$1 AND o.excluido_em IS NULL "+
      "AND o.tipo IS DISTINCT FROM 'receita' ORDER BY mes DESC",[id]),
    titularesPermitidos(user,"edit"),
    canAccessTitular(user,id,"edit"),
    canAccessTitular(user,id,"delete")
  ]);
  const selected=title.rows[0];
  if(!selected)notFound();

  // Links antigos do Explorador permanecem funcionais na planilha.
  const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(query.mes||"")?
    query.mes||"":"";
  const category=cats.some(c=>c.id===query.categoria)?query.categoria||"":"";
  const search=String(query.q||
    (query.recebedor&&query.recebedor!=="__SEM_RECEBEDOR__"?query.recebedor:""))
    .slice(0,120).trim();

  return <ExplorerShell user={user} titulares={books.rows} selected={selected}>
    {query.erro==="arquivo-compartilhado"&&<p className="form-error" role="alert">
      Esta operação contém arquivos compartilhados com outros lançamentos.
      Para evitar misturar documentos, a movimentação foi bloqueada.
    </p>}
    <ExpenseSpreadsheet key={id} bookId={String(id)} cats={cats} tags={tags}
      books={editBooks} canEdit={canEdit} canDelete={canDelete}
      months={months.rows.map(m=>m.mes)} initialMonth={month}
      initialCategory={category} initialSearch={search}/>
  </ExplorerShell>;
}
