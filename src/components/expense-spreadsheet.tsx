"use client";

import { useEffect,useMemo,useState,type FormEvent,type ChangeEvent } from "react";
import { FileSpreadsheet, LoaderCircle, Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { OperationRows,type AttachedDocument,type OperationEntry } from "@/components/operation-rows";

type Book={id:string;nome:string};
type Category={id:string;nome:string;subcategoria:string};
type ExpenseItem=OperationEntry&{
  arquivo_id:string|null;documento:string|null;tem_documento:boolean;data_registro:string;
};
type Month={mes:string;quantidade:number;total:string};
type Data={rows:ExpenseItem[];summary:{total:string;quantidade:number};
  months:Month[];page:number;pageSize:number};
type Sort="data"|"competencia"|"titulo"|"categoria"|"contraparte"|"valor";
const fmt=(n:string)=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export function ExpenseSpreadsheet({bookId,cats,books,canEdit,canDelete,months}:{
  bookId:string;cats:Category[];books:Book[];canEdit:boolean;canDelete:boolean;months:string[];
}){
  const [month,setMonth]=useState("");
  const [category,setCategory]=useState("");
  const [status,setStatus]=useState("todos");
  const [typing,setTyping]=useState("");
  const [q,setQ]=useState("");
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(50);
  const [sort,setSort]=useState<Sort>("competencia");
  const [direction,setDirection]=useState<"asc"|"desc">("desc");
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [exporting,setExporting]=useState(false);
  const [error,setError]=useState("");
  const params=useMemo(()=>{
    const p=new URLSearchParams();
    if(month)p.set("mes",month);
    if(category)p.set("categoria",category);
    if(status!=="todos")p.set("status",status);
    if(q)p.set("q",q);
    p.set("sort",sort);p.set("direction",direction);
    p.set("page",String(page));p.set("pageSize",String(pageSize));
    return p.toString();
  },[month,category,status,q,sort,direction,page,pageSize]);
  useEffect(()=>{
    const ctrl=new AbortController();
    setLoading(true);setError("");setData(null);
    fetch("/api/livros/"+bookId+"/planilha?"+params,{
      signal:ctrl.signal,credentials:"same-origin",cache:"no-store"
    }).then(async response=>{
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"Falha ao consultar lançamentos.");
      return result as Data;
    }).then(result=>{if(!ctrl.signal.aborted)setData(result);})
      .catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Erro na consulta.");})
      .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[bookId,params]);
  const documents:AttachedDocument[]=(data?.rows||[]).filter(x=>x.arquivo_id)
    .map(x=>({operacao_id:x.id,arquivo_id:x.arquivo_id!,
      nome_original:x.documento||"Documento",documento_tipo:"documento"}));
  const count=data?.summary.quantidade||0;
  const pages=Math.max(1,Math.ceil(count/pageSize));
  const update=(setter:(v:string)=>void)=>(event:ChangeEvent<HTMLSelectElement>)=>{
    setter(event.target.value);setPage(1);
  };
  function updateSort(next:Sort){
    if(sort===next)setDirection(d=>d==="asc"?"desc":"asc");
    else{setSort(next);setDirection(next==="titulo"||next==="categoria"||next==="contraparte"?"asc":"desc");}
    setPage(1);
  }
  function submit(e:FormEvent){e.preventDefault();setQ(typing.trim());setPage(1);}
  async function exportExcel(){
    if(exporting)return;
    setExporting(true);setError("");
    try{
      const p=new URLSearchParams(params);p.delete("page");p.delete("pageSize");
      const res=await fetch("/api/livros/"+bookId+"/planilha/excel?"+p.toString(),{
        credentials:"same-origin",cache:"no-store"
      });
      if(!res.ok)throw Error(await res.text()||"Erro ao exportar Excel.");
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download="livro-caixa-saidas-"+bookId+"-"+(month||"todos")+".xlsx";
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),15000);
    }catch(e){setError(e instanceof Error?e.message:"Falha na exportação.");}
    finally{setExporting(false);}
  }
  const sortButton=(label:string,key:Sort)=><button type="button" className="expense-sort"
    aria-label={"Ordenar por "+label} onClick={()=>updateSort(key)}>
    {label}{sort===key?<span aria-hidden="true">{direction==="asc"?" ↑":" ↓"}</span>:null}
  </button>;
  return <div className="expense-sheet">
    <div className="expense-toolbar">
      <label className="expense-month-select" aria-label="Filtrar mês">
        <select value={month} onChange={update(setMonth)}>
          <option value="">Todos os meses</option>
          {months.map(m=><option value={m} key={m}>
            {new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(m+"-01T12:00:00"))}
          </option>)}
        </select>
      </label>
      <form className="expense-search" onSubmit={submit}>
        <Search size={15}/><input value={typing} onChange={e=>setTyping(e.target.value)}
          placeholder="Pesquisar título, contraparte, referência, documento…"
          aria-label="Pesquisar lançamentos"/>
        <button type="submit">Buscar</button>
      </form>
      <label className="expense-filter"><Filter size={14}/>
        <select value={category} onChange={update(setCategory)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cats.map(c=><option key={c.id} value={c.id}>
            {c.nome}{c.subcategoria?" / "+c.subcategoria:""}
          </option>)}
        </select>
      </label>
      <label className="expense-filter">
        <select value={status} onChange={update(setStatus)} aria-label="Anexos">
          <option value="todos">Todos os documentos</option>
          <option value="com-documento">Com documento</option>
          <option value="sem-documento">Sem documento</option>
        </select>
      </label>
      <button className="expense-excel" type="button" disabled={exporting}
        onClick={()=>void exportExcel()}><FileSpreadsheet size={16}/>
        {exporting?"Exportando…":"Exportar Excel"}
      </button>
    </div>
    {error&&<p className="form-error expense-error" role="alert">{error}</p>}
    <div className="expense-table-header" role="row">
      <span>{sortButton("Registro","data")}</span>
      <span>{sortButton("Competência","competencia")}</span>
      <span>{sortButton("Título / descrição","titulo")}</span>
      <span>{sortButton("Categoria","categoria")}</span>
      <span>{sortButton("Contraparte","contraparte")}</span>
      <span>Documento</span>
      <span className="align-right">{sortButton("Valor","valor")}</span>
      <span>Vínculo</span>
    </div>
    {loading&&<div className="expense-loading" role="status">
      <LoaderCircle className="spin" size={17}/> Atualizando lançamentos…
    </div>}
    {!loading&&<OperationRows key={params} variant="spreadsheet"
      operations={data?.rows||[]} documents={documents}
      monthlyTotals={data?.months||[]} books={books}
      canEdit={canEdit} canDelete={canDelete} bookId={bookId}/>}
    <footer className="expense-footer">
      <span>{count.toLocaleString("pt-BR")} lançamentos de saída
        {count>0&&" • "+Math.min((page-1)*pageSize+1,count)+"–"+Math.min(page*pageSize,count)+" exibidos"}</span>
      <strong>Total filtrado: <span>{fmt(data?.summary.total||"0")}</span></strong>
      <label>
        <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}
          aria-label="Itens por página">
          <option value={25}>25 por página</option><option value={50}>50 por página</option>
          <option value={100}>100 por página</option>
        </select>
      </label>
      <nav className="expense-pagination" aria-label="Paginação">
        <button type="button" aria-label="Página anterior" disabled={page<=1}
          onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button>
        <span>{page} / {pages}</span>
        <button type="button" aria-label="Próxima página" disabled={page>=pages}
          onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button>
      </nav>
    </footer>
  </div>;
}