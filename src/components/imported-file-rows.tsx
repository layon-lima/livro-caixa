"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileText, RefreshCw, X } from "lucide-react";
import { DiscardDocument } from "@/components/discard-document";
type Imported={
  id:string;nome_original:string;nome_sugerido?:string;status:string;erro:string|null;
  criado_em:string;nome:string;revisado:boolean;aprovado:boolean;
};
type Menu={id:string;x:number;y:number};
export function ImportedFileRows({files}:{files:Imported[]}){
  const [selected,setSelected]=useState<string|null>(null);
  const [menu,setMenu]=useState<Menu|null>(null);
  const popup=useRef<HTMLDivElement>(null);
  const active=files.find(f=>f.id===menu?.id);
  const fileLabel=(f:Imported)=>f.nome_sugerido||f.nome_original;
  useEffect(()=>{
    if(!menu)return;
    const onClick=(event:PointerEvent)=>{
      if(popup.current&&!popup.current.contains(event.target as Node))setMenu(null);
    };
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setMenu(null);};
    document.addEventListener("pointerdown",onClick);
    document.addEventListener("keydown",onKey);
    return ()=>{document.removeEventListener("pointerdown",onClick);document.removeEventListener("keydown",onKey);};
  },[menu]);
  const open=(id:string,x:number,y:number)=>{
    setSelected(id);
    setMenu({id,x:Math.max(8,Math.min(x,window.innerWidth-310)),
      y:Math.max(8,Math.min(y,window.innerHeight-290))});
  };
  return <div className="table-scroll">
    <table className="admin-table dense-table trash-table">
      <thead><tr><th>Arquivo</th><th>Titular</th><th>Situação</th><th>Recebido em</th></tr></thead>
      <tbody>{files.map(file=><tr key={file.id} tabIndex={0} role="button"
        className={selected===file.id?"selected":""}
        aria-label={fileLabel(file)+". Dois cliques para opções"}
        title="Selecione e dê dois cliques para as ações"
        onClick={()=>setSelected(file.id)}
        onDoubleClick={e=>open(file.id,e.clientX,e.clientY)}
        onContextMenu={e=>{e.preventDefault();open(file.id,e.clientX,e.clientY);}}
        onKeyDown={e=>{
          if(e.key==="Enter"||e.key===" "){
            e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();
            open(file.id,rect.left+80,rect.top+18);
          }
        }}>
        <td title={"Nome no envio: "+file.nome_original}>{fileLabel(file)}</td><td>{file.nome}</td>
        <td>{file.status==="erro"?"Erro":" "+file.status}</td>
        <td>{new Date(file.criado_em).toLocaleString("pt-BR")}</td>
      </tr>)}</tbody>
    </table>
    {!files.length&&<p className="muted">Nenhum documento recebido.</p>}
    {active&&menu&&<div ref={popup} className="entity-actions-popup" role="dialog"
      aria-label={"Ações do arquivo "+fileLabel(active)} style={{left:menu.x,top:menu.y}}>
      <div className="entity-popup-header">
        <strong title={"Nome no envio: "+active.nome_original}>{fileLabel(active)}</strong>
        <button type="button" aria-label="Fechar" onClick={()=>setMenu(null)}><X size={16}/></button>
      </div>
      <div className="entity-popup-options">
        <a href={"/api/documentos/"+active.id} target="_blank" rel="noopener noreferrer">
          <FileText size={15}/> Abrir original
        </a>
        {active.status==="pronto"&&!active.revisado&&
          <Link href={"/conferencia?arquivos="+active.id}>
            <ArrowUpRight size={15}/> Conferir dados
          </Link>}
        {(active.status==="erro"||(active.status==="pronto"&&!active.revisado))&&
          <form action="/api/importar/reprocessar" method="post" className="entity-popup-form">
            <input type="hidden" name="arquivoId" value={active.id}/>
            <button type="submit" className="flat-button"><RefreshCw size={15}/> Reprocessar documento</button>
          </form>}
        {!active.aprovado&&<DiscardDocument arquivoId={active.id} origem="importar"/>}
        {active.erro&&<small>{active.erro}</small>}
      </div>
    </div>}
  </div>;
}