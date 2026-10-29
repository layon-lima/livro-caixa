import "server-only";
import { getDatabase } from "@/lib/database";

export type ExpenseFilters={
  mes:string;categoria:string;q:string;status:"todos"|"com-documento"|"sem-documento";
  sort:"data"|"competencia"|"titulo"|"categoria"|"contraparte"|"valor";
  direction:"asc"|"desc";page:number;pageSize:number;
};
export type ExpenseRow={
  id:string;titular_id:string;titulo:string;categoria_id:string|null;
  categoria:string|null;subcategoria:string|null;tipo:string;competencia:string;
  data_registro:string;data_pagamento:string|null;contraparte:string;descricao:string;referencia:string;
  valor:string|null;quantidade_documentos:string;documento:string|null;arquivo_id:string|null;
  tem_documento:boolean;
};
export type MonthTotal={mes:string;quantidade:number;total:string};

export function parseExpenseFilters(p:URLSearchParams):ExpenseFilters{
  const mes=/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.get("mes")||"")?p.get("mes")!:"";
  const categoria=/^[1-9]\d{0,14}$/.test(p.get("categoria")||"")?p.get("categoria")!:"";
  const q=(p.get("q")||"").trim().slice(0,120);
  const status=["todos","com-documento","sem-documento"].includes(p.get("status")||"")?
    p.get("status") as ExpenseFilters["status"]:"todos";
  const sorts:ExpenseFilters["sort"][]=["data","competencia","titulo","categoria","contraparte","valor"];
  const sort=sorts.includes(p.get("sort") as ExpenseFilters["sort"])?p.get("sort") as ExpenseFilters["sort"]:"competencia";
  const direction=p.get("direction")==="asc"?"asc":"desc";
  const page=Math.max(1,Math.min(100000,Number.parseInt(p.get("page")||"1",10)||1));
  const size=Number.parseInt(p.get("pageSize")||"50",10);
  const pageSize=[25,50,100].includes(size)?size:50;
  return {mes,categoria,q,status,sort,direction,page,pageSize};
}

const orderKeys:Record<ExpenseFilters["sort"],string>={
  data:"o.data_pagamento",competencia:"o.competencia",titulo:"o.titulo",
  categoria:"c.nome",contraparte:"o.contraparte",valor:"o.valor"
};

function condition(filters:ExpenseFilters){
  const predicates=[
    "o.titular_id=$1","o.excluido_em IS NULL",
    // O Livro Caixa de saídas nunca exibe receitas. Tipos ainda não classificados
    // (outro) permanecem visíveis para revisão, sem serem chamados de receita.
    "o.tipo IS DISTINCT FROM 'receita'"
  ];
  const args:(string|number|null)[]=[];
  if(filters.mes){args.push(filters.mes);predicates.push(
    "to_char(o.competencia,'YYYY-MM')=$"+(args.length+1));}
  if(filters.categoria){args.push(filters.categoria);predicates.push(
    "o.categoria_id=$"+(args.length+1));}
  if(filters.q){args.push("%"+filters.q+"%");const n=args.length+1;
    predicates.push("(o.titulo ILIKE $"+n+" OR o.descricao ILIKE $"+n+
      " OR o.contraparte ILIKE $"+n+" OR o.referencia ILIKE $"+n+
      " OR EXISTS (SELECT 1 FROM operacao_arquivos oa2 JOIN arquivos a2 ON a2.id=oa2.arquivo_id "+
      "WHERE oa2.operacao_id=o.id AND a2.nome_original ILIKE $"+n+"))");
  }
  if(filters.status==="com-documento")predicates.push(
    "EXISTS (SELECT 1 FROM operacao_arquivos od WHERE od.operacao_id=o.id)");
  if(filters.status==="sem-documento")predicates.push(
    "NOT EXISTS (SELECT 1 FROM operacao_arquivos od WHERE od.operacao_id=o.id)");
  return {where:" WHERE "+predicates.join(" AND "),args};
}

const from=" FROM operacoes o LEFT JOIN categorias c ON c.id=o.categoria_id ";
const select="SELECT o.id::text,o.titular_id::text,o.titulo,o.categoria_id::text,"+
  "c.nome AS categoria,c.subcategoria,o.tipo,o.competencia::text,o.criado_em::text AS data_registro,o.data_pagamento::text,"+
  "o.contraparte,o.descricao,o.referencia,o.valor::text,"+
  "(SELECT count(*)::text FROM operacao_arquivos oa WHERE oa.operacao_id=o.id) AS quantidade_documentos,"+
  "(SELECT a.nome_original FROM operacao_arquivos oa JOIN arquivos a ON a.id=oa.arquivo_id "+
  "WHERE oa.operacao_id=o.id ORDER BY oa.proposta_id LIMIT 1) AS documento,"+
  "(SELECT oa.arquivo_id::text FROM operacao_arquivos oa WHERE oa.operacao_id=o.id "+
  "ORDER BY oa.proposta_id LIMIT 1) AS arquivo_id,"+
  "EXISTS (SELECT 1 FROM operacao_arquivos oa WHERE oa.operacao_id=o.id) AS tem_documento ";

export async function expensePage(titularId:number,filters:ExpenseFilters){
  const db=getDatabase();
  const {where,args}=condition(filters);
  const values=[titularId,...args];
  const dir=filters.direction==="asc"?"ASC":"DESC";
  const order=orderKeys[filters.sort]+" "+dir+" NULLS LAST,o.id DESC";
  const [rows,summary,months]=await Promise.all([
    db.query<ExpenseRow>(select+from+where+" ORDER BY "+order+" LIMIT $"+
      (values.length+1)+" OFFSET $"+(values.length+2),
      [...values,filters.pageSize,(filters.page-1)*filters.pageSize]),
    db.query<{total:string;quantidade:number}>(
      "SELECT COALESCE(SUM(o.valor),0)::text AS total,COUNT(*)::int AS quantidade "+
      from+where,values),
    db.query<MonthTotal>(
      "SELECT to_char(o.competencia,'YYYY-MM') AS mes,COUNT(*)::int AS quantidade,"+
      "COALESCE(SUM(o.valor),0)::text AS total "+
      from+where+" GROUP BY to_char(o.competencia,'YYYY-MM') ORDER BY mes DESC",values)
  ]);
  return {rows:rows.rows,summary:summary.rows[0]||{total:"0",quantidade:0},
    months:months.rows,page:filters.page,pageSize:filters.pageSize};
}
export async function expenseExport(titularId:number,filters:ExpenseFilters){
  const {where,args}=condition(filters);
  const values=[titularId,...args];
  const dir=filters.direction==="asc"?"ASC":"DESC";
  return getDatabase().query<ExpenseRow>(select+from+where+
    " ORDER BY "+orderKeys[filters.sort]+" "+dir+" NULLS LAST,o.id DESC LIMIT 20001",values);
}
