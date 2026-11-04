"use client";

import {useMemo,useState} from "react";
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
  const [page,setPage]=useState(0);
  // Defesa adicional: aprovados, descartados e duplicados nunca reaparecem
  // na interface de pendências, mesmo se um chamador enviar esses registros.
  const activeItems=useMemo(()=>items.filter(x=>
    !["aprovado","descartado","duplicado","ja-existente","sem-proposta","erro"].includes(x.status)),[items]);
  const isReady=(status:QueueItem["status"])=>status==="pendente"||status==="revisado";
  const isLocked=(item:QueueItem)=>!isReady(item.status);
  const readyCount=activeItems.filter(x=>isReady(x.status)).length;
  const waitingCount=activeItems.filter(x=>
    ["recebendo","aguardando","processando"].includes(x.status)).length;
  const filtered=useMemo(()=>{
    const term=fold(search.trim());
    return activeItems.filter(x=>!term||fold(x.titulo+" "+x.nome_titular+
      " "+(x.referencia||"")).includes(term));
  },[activeItems,search]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const current=Math.min(page,pageCount-1);
  const visible=lote?filtered:filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
  return <div className="cq">
    <div className="cq-toolbar">
      <label className="cq-search"><Search size={15}/><input aria-label="Buscar documentos" value={search}
        onChange={e=>{setSearch(e.target.value);setPage(0);}}
        placeholder="Buscar documento, titular ou referência"/></label>
      {lote&&<div className="cq-batch-progress" role="status">
        <strong>{activeItems.length} documento(s) pendente(s) na fila</strong>
        <span>{readyCount} pronto(s) para validar · {waitingCount} em leitura · {loteTotal??activeItems.length} no ZIP</span>
      </div>}
    </div>
    <div className="cq-form">
      <div className="cq-rows">
        {visible.map(item=>{
          const locked=isLocked(item);
          const active=!locked&&(selectedId===item.id||
            (selectedFile===item.arquivo_id&&item.arquivo_id!==""));
          const url="/conferencia?"+queryRoot+"id="+item.id;
          const info=<>
            <strong title={item.titulo}>{item.ordinal&&<span className="cq-item-number">{item.ordinal}. </span>}{item.titulo}</strong>
            <small title={item.nome_titular}>{item.nome_titular||"Titular em identificação"}</small>
          </>;
          return <div key={item.status+"-"+item.id} className={"cq-row"+
              (active?" selected":"")+(locked?" cq-row-locked":" cq-row-ready")}>
            {["recebendo","aguardando","processando"].includes(item.status)?
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
          {search?"Nenhum documento corresponde à pesquisa.":"Nenhum documento na fila."}
        </p>}
      </div>
      <div className="cq-bottom">
        <div className="cq-pages">
          {lote?<span>{filtered.length} elegível(is) exibido(s) · {loteTotal??activeItems.length} arquivo(s) verificado(s)</span>:<>
            <span>{filtered.length?current*PAGE_SIZE+1:0}–{Math.min(filtered.length,(current+1)*PAGE_SIZE)} de {filtered.length}</span>
            <button type="button" aria-label="Página anterior" disabled={current===0}
              onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button>
            <button type="button" aria-label="Próxima página" disabled={current>=pageCount-1}
              onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button>
          </>}
        </div>
      </div>
    </div>
  </div>;
}
