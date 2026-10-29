import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { ExplorerShell, type Titular } from "@/components/explorer-shell";
import { categorias, titularesPermitidos, safeId, type Operacao } from "@/lib/document-data";
import { GroupedExplorer } from "@/components/grouped-explorer";
import { buildExplorerGroups,categoryName,explorerHref,monthTitle } from "@/lib/explorer-grouping";
import { ExpenseSpreadsheet } from "@/components/expense-spreadsheet";
import { Folder, Search } from "lucide-react";
export const dynamic="force-dynamic";

type Attached = {operacao_id:string;arquivo_id:string;nome_original:string;documento_tipo:string};
type Params = {aba?:string;mes?:string;categoria?:string;recebedor?:string;q?:string;op?:string;erro?:string};
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
  const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(query.mes||"")?query.mes||"":"";
  const groupedQuery=await db.query<{
    mes:string;categoria_id:string|null;categoria:string|null;subcategoria:string|null;
    contraparte:string|null;quantidade:number;
  }>(
    "SELECT to_char(o.competencia,'YYYY-MM') AS mes,o.categoria_id::text,"+
    "c.nome AS categoria,c.subcategoria,o.contraparte,COUNT(*)::int AS quantidade "+
    "FROM operacoes o LEFT JOIN categorias c ON c.id=o.categoria_id "+
    "WHERE o.titular_id=$1 AND o.excluido_em IS NULL AND o.tipo IS DISTINCT FROM 'receita' "+
    "GROUP BY mes,o.categoria_id,c.nome,c.subcategoria,o.contraparte",[id]);
  const groups=buildExplorerGroups(groupedQuery.rows);
  const activeMonth=groups.find(m=>m.mes===month)||null;
  const categoryParam=String(query.categoria||"");
  const activeCategory=activeMonth?.categories.find(c=>
    categoryParam==="sem"?c.key==="__SEM_CATEGORIA__":c.ids.includes(categoryParam))||null;
  const recipientParam=String(query.recebedor||"");
  const activeRecipient=activeCategory?.recipients.find(r=>r.key===recipientParam)||null;
  // Operações individuais somente dentro de um recebedor ou na pesquisa global.
  const fetchOperations=!spreadsheet&&Boolean(q||activeRecipient);
  const categoryIds=activeCategory?.ids||[];
  const recipientVariants=activeRecipient?.variants||[];
  const categoryWhere=activeCategory?.key==="__SEM_CATEGORIA__"?
    "o.categoria_id IS NULL":"o.categoria_id::text=ANY($4::text[])";
  const data=fetchOperations?await db.query<Operacao>(
    "SELECT o.id::text,o.titular_id::text,o.titulo,o.competencia::text,o.categoria_id::text,"+
    "c.nome AS categoria,c.subcategoria,o.tipo,o.descricao,o.contraparte,o.referencia,"+
    "o.valor::text,o.criado_em::text,o.excluido_em::text,"+
    "(SELECT count(*)::text FROM operacao_arquivos oa WHERE oa.operacao_id=o.id) AS quantidade_documentos "+
    "FROM operacoes o LEFT JOIN categorias c ON c.id=o.categoria_id "+
    "WHERE o.titular_id=$1 AND o.excluido_em IS NULL AND o.tipo IS DISTINCT FROM 'receita' "+
    "AND ($2::text IS NULL OR to_char(o.competencia,'YYYY-MM')=$2) "+
    "AND ($3::boolean=FALSE OR "+categoryWhere+") "+
    "AND ($5::boolean=FALSE OR COALESCE(o.contraparte,'')=ANY($6::text[])) "+
    "AND ($7::text IS NULL OR o.titulo ILIKE '%'||$7||'%' OR o.descricao ILIKE '%'||$7||'%' "+
    "OR o.contraparte ILIKE '%'||$7||'%' OR o.referencia ILIKE '%'||$7||'%' OR "+
    "EXISTS (SELECT 1 FROM operacao_arquivos oa JOIN arquivos a ON a.id=oa.arquivo_id "+
    "WHERE oa.operacao_id=o.id AND (a.texto_extraido ILIKE '%'||$7||'%' "+
    "OR a.nome_original ILIKE '%'||$7||'%'))) "+
    "ORDER BY o.competencia DESC,o.id DESC LIMIT 500",
    [id,month||null,Boolean(activeCategory),categoryIds,Boolean(activeRecipient),
      recipientVariants,q||null]
  ):{rows:[] as Operacao[]};
  const ops=data.rows;
  const attached=fetchOperations&&ops.length?await db.query<Attached>(
    "SELECT oa.operacao_id::text,oa.arquivo_id::text,a.nome_original,p.documento_tipo "+
    "FROM operacao_arquivos oa JOIN arquivos a ON a.id=oa.arquivo_id "+
    "JOIN propostas p ON p.id=oa.proposta_id "+
    "WHERE oa.operacao_id=ANY($1::bigint[]) ORDER BY oa.proposta_id",
    [ops.map(o=>Number(o.id))]
  ):{rows:[] as Attached[]};
  const years=new Map<string,typeof groups>();
  for(const group of groups){
    const year=group.mes.slice(0,4);
    if(!years.has(year))years.set(year,[]);
    years.get(year)!.push(group);
  }
  const folder=<div className="folder-tree" aria-label="Pastas por mês, categoria e recebedor">
    {[...years.entries()].map(([year,months])=><details key={year} open>
      <summary><Folder size={14} className="folder-icon"/>{year}</summary>
      {months.map(m=><details key={m.mes} open={m.mes===month}>
        <summary><Folder size={14} className="folder-icon"/>
          <Link href={explorerHref(id,{mes:m.mes})}>{monthTitle(m.mes).replace(/ de \d{4}$/,"")}</Link>
          <span className="explorer-tree-count">{m.count}</span>
        </summary>
        {m.categories.map(cat=><details key={cat.key}
          open={m.mes===month&&activeCategory?.key===cat.key}>
          <summary className="explorer-tree-category">
            <Folder size={13} className="folder-icon"/>
            <Link href={explorerHref(id,{mes:m.mes,categoria:cat.ids[0]||"sem"})}>
              {categoryName(cat.name,cat.subcategoria)}
            </Link>
            <span className="explorer-tree-count">{cat.count}</span>
          </summary>
          {cat.recipients.map(rec=><a key={rec.key}
            className={"folder-leaf explorer-recipient-leaf"+(
              m.mes===month&&activeRecipient?.key===rec.key?" active":"")}
            href={explorerHref(id,{mes:m.mes,categoria:cat.ids[0]||"sem",recebedor:rec.key})}>
            <Folder size={13} className="folder-icon"/>{rec.name}
            <span className="explorer-tree-count">{rec.count}</span>
          </a>)}
        </details>)}
      </details>)}
    </details>)}
  </div>;
  const [canEdit,canDelete,editBooks]=await Promise.all([
    canAccessTitular(user,id,"edit"),canAccessTitular(user,id,"delete"),
    titularesPermitidos(user,"edit")
  ]);
  return <ExplorerShell user={user} titulares={books.rows} selected={selected}
    folderContent={folder} operationCount={groups.reduce((sum,m)=>sum+m.count,0)} tabBookId={String(id)}
    activeTab={spreadsheet?"planilha":"explorador"}>
    {spreadsheet?<ExpenseSpreadsheet bookId={String(id)} cats={cats}
      books={editBooks} canEdit={canEdit} canDelete={canDelete}
      months={groups.map(g=>g.mes)}/> : <>
    {query.erro==="arquivo-compartilhado"&&<p className="form-error" role="alert">Esta operação contém arquivos compartilhados com outros lançamentos. Para evitar misturar documentos, o movimento foi bloqueado.</p>}
    <div className="list-toolbar">
      <form action={"/livros/"+id} className="search-bar">
        <Search size={15}/>
        <input name="q" defaultValue={q} placeholder="Pesquisar lançamentos e conteúdo OCR"/>
        <button type="submit">Pesquisar</button>
      </form>
      {q&&<a className="flat-button" href={explorerHref(id)}>Limpar pesquisa</a>}
    </div>
    <div className="file-columns" aria-hidden="true">
      <div className="col-main">{q||activeRecipient?"Lançamento":"Pasta"}</div>
      <div className="col-category">{q||activeRecipient?"Categoria":"Nível"}</div>
      <div className="col-period">Competência</div>
      <div className="col-docs">{q||activeRecipient?"Documentos":"Itens"}</div>
    </div>
    <GroupedExplorer bookId={String(id)} months={groups}
      activeMonth={activeMonth} activeCategory={activeCategory}
      activeRecipient={activeRecipient} search={q} operations={ops}
      documents={attached.rows} books={editBooks} canEdit={canEdit}
      canDelete={canDelete}/>
    </>}
  </ExplorerShell>;
}
