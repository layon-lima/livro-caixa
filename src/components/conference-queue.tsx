"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {CheckCircle2,ChevronLeft,ChevronRight,FileText,LoaderCircle,Search} from "lucide-react";

export type QueueItem={
  id:string;
  arquivo_id:string;
  titulo:string;
  nome_titular:string;
  status:"pendente"|"revisado"|"aprovado"|"aguardando"|"processando"|"erro"|"duplicado"|"recebendo"|"ja-existente"|"descartado"|"sem-proposta";
  operacao_id?:string|null;
  referencia?:string|null;
  ordinal?:number;
};

const PAGE_SIZE=12;
const fold=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const tags:Record<QueueItem["status"],string>={
  pendente:"Pronto para validar",
  revisado:"Conferido",
  aprovado:"Aprovado",
  aguardando:"Na fila",
  processando:"Analisando",
  erro:"Erro na leitura",
  duplicado:"Duplicado",
  recebendo:"Na extração",
  "ja-existente":"Já cadastrado",
  descartado:"Descartado",
  "sem-proposta":"Sem proposta",
};

export function ConferenceQueue({items,queryRoot,selectedId,selectedFile,lote,arquivos,loteTotal}:{
  items:QueueItem[];queryRoot:string;selectedId?:string;selectedFile?:string;
  lote?:string;arquivos?:string;loteTotal?:number;
}){
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<"todos"|"pendentes"|"conferidos"|"erros">(
    lote?"todos":items.some(x=>["pendente","revisado","duplicado","aguardando","processando"].includes(x.status))?"pendentes":"todos");
  const [page,setPage]=useState(0);
  const [marked,setMarked]=useState<string[]>([]);
  const needsReview=(status:QueueItem["status"])=>
    ["pendente","revisado","aguardando","processando","recebendo"].includes(status);
  const isReady=(status:QueueItem["status"])=>status==="pendente"||status==="revisado";
  const isLocked=(item:QueueItem)=>!isReady(item.status)&&
    !(item.status==="aprovado"&&Boolean(item.operacao_id));
  const readyCount=items.filter(x=>isReady(x.status)).length;
  const waitingCount=items.filter(x=>
    ["recebendo","aguardando","processando"].includes(x.status)).length;
  const counts={
    todos:items.length,
    pendentes:items.filter(x=>needsReview(x.status)).length,
    conferidos:items.filter(x=>x.status==="aprovado").length,
    erros:items.filter(x=>x.status==="erro"||x.status==="sem-proposta").length
  };
  // Quando o último pendente some da fila, não deixar o filtro
  // de pendentes selecionado com conteúdo em outra aba.
  useEffect(()=>{
    if(filter==="pendentes"&&counts.pendentes===0&&counts.todos>0){
      setFilter("todos");setPage(0);
    }
  },[filter,counts.pendentes,counts.todos]);
  const filtered=useMemo(()=>{
    const term=fold(search.trim());
    return items.filter(x=>{
      const group=filter==="todos"||
        (filter==="pendentes"&&needsReview(x.status))||
        (filter==="conferidos"&&x.status==="aprovado")||
        (filter==="erros"&&(x.status==="erro"||x.status==="sem-proposta"));
      return group&&(!term||fold(x.titulo+" "+x.nome_titular+" "+(x.referencia||"")).includes(term));
    });
  },[items,filter,search]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const current=Math.min(page,pageCount-1);
  const visible=lote?filtered:filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
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
      {lote&&<div className="cq-batch-progress" role="status">
        <strong>{loteTotal??items.length} arquivos no ZIP</strong>
        <span>{readyCount} pronto(s) para validar · {waitingCount} em leitura</span>
      </div>}
    </div>
    <form action="/api/propostas/aprovar" method="post" className="cq-form">
      {lote&&<input type="hidden" name="lote" value={lote}/>}
      {arquivos&&<input type="hidden" name="arquivos" value={arquivos}/>}
      {validMarked.map(id=><input key={id} type="hidden" name="ids" value={id}/>)}
      <div className="cq-rows">
        {visible.map(item=>{
          const checked=marked.includes(item.id);
          const locked=isLocked(item);
          const active=!locked&&(selectedId===item.id||
            (selectedFile===item.arquivo_id&&item.arquivo_id!==""));
          const url=item.status==="aprovado"&&item.operacao_id?
            "/operacoes/"+item.operacao_id:
            "/conferencia?"+queryRoot+"id="+item.id;
          const info=<>
            <strong title={item.titulo}>{item.ordinal&&<span className="cq-item-number">{item.ordinal}. </span>}{item.titulo}</strong>
            <small title={item.nome_titular}>{item.nome_titular||"Titular em identificação"}</small>
          </>;
          return <div key={item.status+"-"+item.id} className={"cq-row"+
              (active?" selected":"")+(locked?" cq-row-locked":" cq-row-ready")}>
            {item.status==="revisado"?
              <input aria-label={"Selecionar "+item.titulo+" para aprovação em lote"} type="checkbox"
                checked={checked} onChange={e=>setMarked(old=>
                  e.target.checked?[...old,item.id]:old.filter(v=>v!==item.id))}/>:
              ["recebendo","aguardando","processando"].includes(item.status)?
                <LoaderCircle size={14} className="cq-file-icon" aria-label="Aguardando"/>:
              item.status==="aprovado"?<CheckCircle2 size={15} className="cq-done"/>:
              <FileText size={15} className="cq-file-icon"/>}
            {locked?
              <div className="cq-row-link" aria-disabled="true" title="Indisponível para conferência até a leitura terminar">{info}</div>:
              <Link className="cq-row-link" href={url}>{info}</Link>}
            <span className={"cq-status cq-"+item.status}>{tags[item.status]}</span>
          </div>;
        })}
        {!visible.length&&<p className="cq-empty">
          {search?"Nenhum documento corresponde à pesquisa.":"Nenhum documento neste filtro."}
        </p>}
      </div>
      <div className="cq-bottom">
        <div className="cq-pages">
          {lote?<span>{filtered.length} exibido(s) · {loteTotal??items.length} arquivo(s) do ZIP</span>:<>
            <span>{filtered.length?current*PAGE_SIZE+1:0}–{Math.min(filtered.length,(current+1)*PAGE_SIZE)} de {filtered.length}</span>
            <button type="button" aria-label="Página anterior" disabled={current===0}
              onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button>
            <button type="button" aria-label="Próxima página" disabled={current>=pageCount-1}
              onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button>
          </>}
        </div>
        <button type="submit" className="primary-btn cq-approve" disabled={!canApprove}>
          Aprovar selecionados{validMarked.length>0?" ("+validMarked.length+")":""}
        </button>
      </div>
    </form>
  </div>;
}
