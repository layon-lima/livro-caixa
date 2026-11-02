"use client";

import {useMemo,useState} from "react";
import Link from "next/link";
import {CheckCircle2,ChevronLeft,ChevronRight,FileText,LoaderCircle,Search} from "lucide-react";

export type QueueItem={
  id:string;
  arquivo_id:string;
  titulo:string;
  nome_titular:string;
  status:"pendente"|"revisado"|"aprovado"|"aguardando"|"processando"|"erro"|"duplicado";
  operacao_id?:string|null;
  referencia?:string|null;
};

const PAGE_SIZE=12;
const fold=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const tags:Record<QueueItem["status"],string>={
  pendente:"Para conferir",
  revisado:"Conferido",
  aprovado:"Aprovado",
  aguardando:"Na fila",
  processando:"Analisando",
  erro:"Erro na leitura",
  duplicado:"Duplicado",
};

export function ConferenceQueue({items,queryRoot,selectedId,selectedFile,lote,arquivos}:{
  items:QueueItem[];queryRoot:string;selectedId?:string;selectedFile?:string;
  lote?:string;arquivos?:string;
}){
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<"todos"|"pendentes"|"conferidos"|"erros">(
    items.some(x=>["pendente","revisado","duplicado"].includes(x.status))?"pendentes":"todos");
  const [page,setPage]=useState(0);
  const [marked,setMarked]=useState<string[]>([]);
  const counts={
    todos:items.length,
    pendentes:items.filter(x=>["pendente","revisado","duplicado"].includes(x.status)).length,
    conferidos:items.filter(x=>x.status==="aprovado").length,
    erros:items.filter(x=>x.status==="erro").length
  };
  const filtered=useMemo(()=>{
    const term=fold(search.trim());
    return items.filter(x=>{
      const group=filter==="todos"||
        (filter==="pendentes"&&["pendente","revisado","duplicado"].includes(x.status))||
        (filter==="conferidos"&&x.status==="aprovado")||
        (filter==="erros"&&x.status==="erro");
      return group&&(!term||fold(x.titulo+" "+x.nome_titular+" "+(x.referencia||"")).includes(term));
    });
  },[items,filter,search]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const current=Math.min(page,pageCount-1);
  const visible=filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
  const validMarked=marked.filter(id=>items.some(x=>x.id===id&&x.status==="revisado"));
  const canApprove=validMarked.length>0;
  function changeFilter(v:typeof filter){setFilter(v);setPage(0);}
  return <div className="cq">
    <div className="cq-toolbar">
      <label className="cq-search"><Search size={15}/><input aria-label="Buscar documentos" value={search}
        onChange={e=>{setSearch(e.target.value);setPage(0);}}
        placeholder="Buscar documento, titular ou referência"/></label>
      <div className="cq-filters" aria-label="Filtrar a fila">
        {([
          ["todos","Todos",counts.todos],
          ["pendentes","Para conferir",counts.pendentes],
          ["conferidos","Conferidos",counts.conferidos],
          ["erros","Erros",counts.erros]
        ] as const).map(([key,label,total])=>
          <button key={key} type="button" aria-pressed={filter===key}
            className={filter===key?"active":""} onClick={()=>changeFilter(key)}>
            {label} <span>{total}</span>
          </button>)}
      </div>
    </div>
    <form action="/api/propostas/aprovar" method="post" className="cq-form">
      {lote&&<input type="hidden" name="lote" value={lote}/>}
      {arquivos&&<input type="hidden" name="arquivos" value={arquivos}/>}
      {validMarked.map(id=><input key={id} type="hidden" name="ids" value={id}/>)}
      <div className="cq-rows">
        {visible.map(item=>{
          const checked=marked.includes(item.id);
          const active=(item.status==="aguardando"||item.status==="processando"||item.status==="erro")
            ?selectedFile===item.arquivo_id:selectedId===item.id;
          const url=item.status==="aprovado"&&item.operacao_id?
            "/operacoes/"+item.operacao_id:
            "/conferencia?"+queryRoot+
              (["aguardando","processando","erro"].includes(item.status)?
                "arquivo="+item.arquivo_id:"id="+item.id);
          return <div key={item.status+"-"+item.id} className={"cq-row"+(active?" selected":"")}>
            {item.status==="revisado"?
              <input aria-label={"Selecionar "+item.titulo+" para aprovação em lote"} type="checkbox"
                checked={checked} onChange={e=>setMarked(old=>
                  e.target.checked?[...old,item.id]:old.filter(v=>v!==item.id))}/>:
              item.status==="processando"?<LoaderCircle size={14} className="spin" aria-label="Lendo"/>:
              item.status==="aprovado"?<CheckCircle2 size={15} className="cq-done"/>:
              <FileText size={15} className="cq-file-icon"/>}
            <Link className="cq-row-link" href={url}>
              <strong title={item.titulo}>{item.titulo}</strong>
              <small title={item.nome_titular}>{item.nome_titular||"Titular em identificação"}</small>
            </Link>
            <span className={"cq-status cq-"+item.status}>{tags[item.status]}</span>
          </div>;
        })}
        {!visible.length&&<p className="cq-empty">
          {search?"Nenhum documento corresponde à pesquisa.":"Nenhum documento neste filtro."}
        </p>}
      </div>
      <div className="cq-bottom">
        <div className="cq-pages">
          <span>{filtered.length?current*PAGE_SIZE+1:0}–{Math.min(filtered.length,(current+1)*PAGE_SIZE)} de {filtered.length}</span>
          <button type="button" aria-label="Página anterior" disabled={current===0}
            onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button>
          <button type="button" aria-label="Próxima página" disabled={current>=pageCount-1}
            onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button>
        </div>
        <button type="submit" className="primary-btn cq-approve" disabled={!canApprove}>
          Aprovar selecionados{validMarked.length>0?" ("+validMarked.length+")":""}
        </button>
      </div>
    </form>
  </div>;
}
