"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Folder, FolderInput, Pencil, Trash2, X, Eye, ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";

export type OperationEntry={
  id:string;titular_id:string;titulo:string;categoria:string|null;subcategoria:string|null;
  categoria_id:string|null;competencia:string;tipo:string;descricao:string;
  contraparte:string;referencia:string;valor:string|null;quantidade_documentos:string; data_registro?:string; documento?:string|null; tem_documento?:boolean;
};
export type AttachedDocument={operacao_id:string;arquivo_id:string;nome_original:string;documento_tipo:string};
type Book={id:string;nome:string};
type Props={
  operations:OperationEntry[];documents:AttachedDocument[];books:Book[];
  canEdit:boolean;canDelete:boolean;bookId:string;
  variant?:"explorer"|"spreadsheet";monthlyTotals?:{mes:string;quantidade:number;total:string}[];
};
type Menu={id:string;x:number;y:number;view:"actions"|"files"|"move"|"delete"|"info"};
const money=(v:string|null)=>v===null?"":Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const place=(x:number,y:number)=>({
  x:Math.max(8,Math.min(x,window.innerWidth-310)),
  y:Math.max(8,Math.min(y,window.innerHeight-350))
});

export function OperationRows({operations,documents,books,canEdit,canDelete,bookId,variant="explorer",monthlyTotals=[]}:Props){
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [menu,setMenu]=useState<Menu|null>(null);
  const [destination,setDestination]=useState("");
  const popup=useRef<HTMLDivElement>(null);
  const docs=new Map<string,AttachedDocument[]>();
  for(const f of documents)docs.set(f.operacao_id,[...(docs.get(f.operacao_id)||[]),f]);
  const current=operations.find(o=>o.id===menu?.id);
  const currentDocs=current?docs.get(current.id)||[]:[];
  useEffect(()=>{
    if(!menu)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setMenu(null);};
    const onClick=(e:globalThis.MouseEvent)=>{
      if(popup.current&&!popup.current.contains(e.target as Node))setMenu(null);
    };
    document.addEventListener("keydown",onKey);
    document.addEventListener("pointerdown",onClick);
    return ()=>{document.removeEventListener("keydown",onKey);document.removeEventListener("pointerdown",onClick);};
  },[menu]);
  function show(id:string,x:number,y:number){
    const position=place(x,y);
    setSelected(id);setDestination(bookId);
    setMenu({id,...position,view:"actions"});
  }
  const view=(kind:Menu["view"])=>setMenu(m=>m?{...m,view:kind}:null);
  return <div className={"operation-scroll"+(variant==="spreadsheet"?" expense-scroll":"")} aria-label="Operações do livro">
    {variant==="spreadsheet"?(()=>{
      const monthly=new Map<string,OperationEntry[]>();
      for(const op of operations){
        const month=op.competencia.slice(0,7);
        monthly.set(month,[...(monthly.get(month)||[]),op]);
      }
      const monthLabel=(month:string)=>{
        const [year,m]=month.split("-");
        return new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"})
          .format(new Date(Number(year),Number(m)-1,1));
      };
      return [...monthly].sort((a,b)=>b[0].localeCompare(a[0])).map(([month,entries])=>{
        const total=monthlyTotals.find(x=>x.mes===month);
        const closed=collapsed.includes(month);
        return <section className="expense-month" key={month}>
          <button type="button" className="expense-month-header"
            onClick={()=>setCollapsed(old=>closed?old.filter(x=>x!==month):[...old,month])}
            aria-expanded={!closed}>
            {closed?<ChevronRight size={15}/>:<ChevronDown size={15}/>}
            <strong>{monthLabel(month)}</strong>
            <span>{total?.quantidade??entries.length} lançamentos</span>
            <span className="expense-month-total">Total do mês: <strong>{money(total?.total||"0")}</strong></span>
          </button>
          {!closed&&entries.map(op=><div key={op.id} className={"expense-sheet-row"+(selected===op.id?" selected":"")}
            role="button" tabIndex={0} title="Clique para selecionar, duplo clique para ações"
            aria-label={op.titulo+". Dois cliques para ações"}
            onClick={()=>{setSelected(op.id);setMenu(null);}}
            onDoubleClick={e=>show(op.id,e.clientX,e.clientY)}
            onContextMenu={e=>{e.preventDefault();show(op.id,e.clientX,e.clientY);}}
            onKeyDown={e=>{
              if(e.key==="Enter"||e.key===" "){
                e.preventDefault();const b=e.currentTarget.getBoundingClientRect();
                show(op.id,b.left+80,b.top+20);
              }
            }}>
            <span>{op.data_registro?new Date(op.data_registro).toLocaleDateString("pt-BR"):"—"}</span>
            <span>{op.competencia.slice(0,7)}</span>
            <span className="expense-strong" title={op.titulo}>{op.titulo}</span>
            <span title={[op.categoria,op.subcategoria].filter(Boolean).join(" / ")}>
              {op.categoria||"Sem categoria"}{op.subcategoria?" / "+op.subcategoria:""}</span>
            <span title={op.contraparte||""}>{op.contraparte||"—"}</span>
            <span title={op.documento||""}>{op.documento||"—"}</span>
            <span className="expense-value">{op.valor!==null?money(op.valor):"—"}</span>
            <span className={"expense-status"+(op.tem_documento?" linked":" unlinked")}>
              {op.tem_documento?"Com documento":"Sem documento"}
            </span>
          </div>)}
        </section>;
      });
    })():operations.map(op=><div key={op.id}
      className={"operation-row operation-popup-row"+(selected===op.id?" selected":"")}
      role="button" tabIndex={0} aria-label={op.titulo+". Dois cliques para ações"}
      title="Clique para selecionar; dois cliques para ações"
      onClick={()=>{setSelected(op.id);setMenu(null);}}
      onDoubleClick={e=>show(op.id,e.clientX,e.clientY)}
      onContextMenu={e=>{e.preventDefault();show(op.id,e.clientX,e.clientY);}}
      onKeyDown={e=>{
        if(e.key==="Enter"||e.key===" "){
          e.preventDefault();
          const b=e.currentTarget.getBoundingClientRect();
          show(op.id,b.left+75,b.top+25);
        }
      }}>
      <span className="operation-name"><Folder size={15} className="folder-icon"/><span>{op.titulo}</span></span>
      <span>{op.categoria||"Sem categoria"}{op.subcategoria?" / "+op.subcategoria:""}</span>
      <span>{op.competencia.slice(0,7)}</span>
      <span>{op.quantidade_documentos}</span>
    </div>)}
    {operations.length===0&&<p className="empty-info">Nenhuma operação para os filtros selecionados.</p>}
    {menu&&current&&<div ref={popup} className="entity-actions-popup" role="dialog"
      aria-label={"Ações de "+current.titulo} style={{left:menu.x,top:menu.y}}
      onClick={e=>e.stopPropagation()}>
      <div className="entity-popup-header">
        {menu.view!=="actions"&&<button type="button" aria-label="Voltar às ações" onClick={()=>view("actions")}><ChevronLeft size={16}/></button>}
        <strong title={current.titulo}>{current.titulo}</strong>
        <button type="button" onClick={()=>setMenu(null)} aria-label="Fechar ações"><X size={16}/></button>
      </div>
      {menu.view==="actions"&&<div className="entity-popup-options">
        <button type="button" onClick={()=>view("info")}><Eye size={15}/> Detalhes da operação</button>
        {currentDocs.length>0&&<button type="button" onClick={()=>view("files")}>
          <FileText size={15}/> Documentos ({currentDocs.length})
        </button>}
        {canEdit&&<Link href={"/operacoes/"+current.id} onClick={()=>setMenu(null)}>
          <Pencil size={15}/> Editar dados
        </Link>}
        {canEdit&&books.length>1&&<button type="button" onClick={()=>view("move")}>
          <FolderInput size={15}/> Mover para outro titular
        </button>}
        {canDelete&&<button type="button" className="entity-destructive" onClick={()=>view("delete")}>
          <Trash2 size={15}/> Enviar para a lixeira
        </button>}
        {!canEdit&&!canDelete&&currentDocs.length===0&&<small>Sem outras ações autorizadas.</small>}
      </div>}
      {menu.view==="info"&&<div className="entity-popup-details">
        <div><span>Categoria</span><strong>{current.categoria||"Sem categoria"}</strong></div>
        <div><span>Competência</span><strong>{current.competencia.slice(0,7)}</strong></div>
        <div><span>Tipo</span><strong>{current.tipo}</strong></div>
        <div><span>Valor</span><strong>{money(current.valor)||"—"}</strong></div>
        <div><span>Contraparte</span><strong>{current.contraparte||"—"}</strong></div>
        <div><span>Referência</span><strong>{current.referencia||"—"}</strong></div>
        {current.descricao&&<p>{current.descricao}</p>}
      </div>}
      {menu.view==="files"&&<div className="entity-popup-options">
        {currentDocs.map(f=><a key={f.arquivo_id} href={"/api/documentos/"+f.arquivo_id}
          target="_blank" rel="noopener noreferrer"><FileText size={15}/><span className="truncate">{f.nome_original}</span></a>)}
      </div>}
      {menu.view==="move"&&<form className="entity-popup-form"
        action={"/api/operacoes/"+current.id+"/mover"} method="post">
        <p>Mover para outro livro autorizado. Se o arquivo for compartilhado com outras operações, o sistema bloqueará a mudança para proteger os documentos.</p>
        <label>Novo titular
          <select name="destinoId" value={destination} onChange={e=>setDestination(e.target.value)}>
            <option value={bookId}>Selecione outro titular</option>
            {books.filter(b=>b.id!==bookId).map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <button type="submit" className="primary-btn" disabled={destination===bookId||!destination}>Mover operação</button>
      </form>}
      {menu.view==="delete"&&<form className="entity-popup-form" action={"/api/operacoes/"+current.id} method="post">
        <input type="hidden" name="acao" value="excluir"/>
        <p>Enviar <strong>{current.titulo}</strong> para a lixeira? A operação poderá ser restaurada.</p>
        <div className="entity-popup-confirm">
          <button type="button" className="flat-button" onClick={()=>view("actions")}>Cancelar</button>
          <button type="submit" className="primary-btn">Confirmar exclusão</button>
        </div>
      </form>}
    </div>}
  </div>;
}