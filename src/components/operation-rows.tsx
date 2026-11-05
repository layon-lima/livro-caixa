"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText, Folder, FolderInput, Pencil, Trash2, X, Eye, ChevronLeft, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";
import { suggestDocumentName } from "@/lib/document-name";
import { formatTransactionDate } from "@/lib/spreadsheet-fields";

export type OperationEntry={
  id:string;titular_id:string;titulo:string;categoria:string|null;subcategoria:string|null;tags?:string[];
  arquivo_id?:string|null;
  categoria_id:string|null;competencia:string;tipo:string;descricao:string;
  contraparte:string;referencia:string;valor:string|null;quantidade_documentos:string; data_registro?:string; data_pagamento?:string|null; documento?:string|null; documento_tipo?:string|null; tem_documento?:boolean;
};
export type AttachedDocument={operacao_id:string;arquivo_id:string;nome_original:string;documento_tipo:string;quantidade_no_arquivo?:number;nome_exibicao?:string};
type Book={id:string;nome:string};
const displayName=(doc:AttachedDocument,op:OperationEntry)=>doc.nome_exibicao||
  suggestDocumentName({
    originalName:doc.nome_original,documentType:doc.documento_tipo,title:op.titulo,
    counterparty:op.contraparte,category:op.categoria,subcategory:op.subcategoria,
    description:op.descricao,paymentDate:op.data_pagamento,
  });
type Props={
  operations:OperationEntry[];documents:AttachedDocument[];books:Book[];
  canEdit:boolean;canDelete:boolean;isAdmin:boolean;bookId:string;
  variant?:"explorer"|"spreadsheet";monthlyTotals?:{mes:string;quantidade:number;total:string}[];
  columnHeader?:ReactNode;
};
type Menu={id:string;x:number;y:number;view:"actions"|"files"|"move"|"delete"|"info";arquivoId?:string};
const money=(v:string|null)=>v===null?"":Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const place=(x:number,y:number)=>({
  x:Math.max(8,Math.min(x,window.innerWidth-310)),
  y:Math.max(8,Math.min(y,window.innerHeight-350))
});

export function OperationRows({operations,documents,books,canEdit,canDelete,isAdmin,bookId,variant="explorer",monthlyTotals=[],columnHeader}:Props){
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [menu,setMenu]=useState<Menu|null>(null);
  const [destination,setDestination]=useState("");
  const popup=useRef<HTMLDivElement>(null);
  const docs=new Map<string,AttachedDocument[]>();
  for(const f of documents)docs.set(f.operacao_id,[...(docs.get(f.operacao_id)||[]),f]);
  const current=operations.find(o=>o.id===menu?.id);
  const currentDocs=current?docs.get(current.id)||[]:[];
  // O recebedor é a última pasta: mostrar arquivos reais, um por anexo.
  // Operações sem PDF continuam visíveis como lançamentos manuais, sem pasta extra.
  const fileEntries:{op:OperationEntry;doc:AttachedDocument|null;key:string}[]=
    operations.flatMap<{op:OperationEntry;doc:AttachedDocument|null;key:string}>(op=>{
      const linked=docs.get(op.id)||[];
      return linked.length?linked.map(doc=>({op,doc,key:op.id+":"+doc.arquivo_id})):
        [{op,doc:null,key:op.id+":sem-anexo"}];
    });
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
  function show(id:string,x:number,y:number,arquivoId?:string){
    if(!isAdmin)return;
    const position=place(x,y);
    setSelected(id);setDestination(bookId);
    setMenu({id,...position,view:"actions",arquivoId});
  }
  // Para contas comuns: somente o PDF vinculado ao lançamento, sem popup.
  // A checagem de acesso ao documento continua no servidor.
  function openDocument(id:string,arquivoId?:string){
    if(!arquivoId)return;
    window.open("/api/documentos/"+encodeURIComponent(arquivoId)+
      "?operacao="+encodeURIComponent(id),"_blank","noopener,noreferrer");
  }
  function activate(id:string,x:number,y:number,arquivoId?:string){
    if(isAdmin)show(id,x,y,arquivoId);
    else openDocument(id,arquivoId);
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
            <CalendarDays size={15} className="expense-month-icon" aria-hidden="true"/>
            <strong>{monthLabel(month)}</strong>
            <span className="expense-month-count">{total?.quantidade??entries.length} lançamentos</span>
            <span className="expense-month-total">Total do mês: <strong>{money(total?.total||"0")}</strong></span>
          </button>
          {!closed&&<>
            {columnHeader}
            {entries.map(op=><div key={op.id} className={"expense-sheet-row"+(selected===op.id?" selected":"")}
              role="button" tabIndex={0}
              title={isAdmin?"Clique para selecionar, duplo clique para ações":op.arquivo_id?"Duplo clique para abrir o documento":"Lançamento sem documento"}
              aria-label={op.titulo+(isAdmin?". Dois cliques para ações":op.arquivo_id?". Dois cliques para abrir o documento":". Sem documento")}
              onClick={()=>{setSelected(op.id);setMenu(null);}}
              onDoubleClick={e=>activate(op.id,e.clientX,e.clientY,op.arquivo_id||undefined)}
              onContextMenu={e=>{if(isAdmin){e.preventDefault();show(op.id,e.clientX,e.clientY);}}}
              onKeyDown={e=>{
                if(e.key==="Enter"||e.key===" "){
                  e.preventDefault();const b=e.currentTarget.getBoundingClientRect();
                  activate(op.id,b.left+80,b.top+20,op.arquivo_id||undefined);
                }
              }}>
              <span className="expense-date" title={op.data_pagamento?"Data efetiva da transação: "+formatTransactionDate(op.data_pagamento):"Data da transação não identificada"}>
                {formatTransactionDate(op.data_pagamento)}
              </span>
              <span className="expense-value">{op.valor!==null?money(op.valor):"—"}</span>
              <span className={"expense-document"+(!op.documento?" expense-document-missing":"")} title={op.documento||"Sem documento"}>
                {op.documento&&<FileText size={15} strokeWidth={1.7} aria-hidden="true"/>}
                <span>{op.documento||"Sem documento"}</span>
              </span>
              <span className="expense-category" title={op.categoria||"Sem categoria"}>
                <span className="expense-category-chip">{op.categoria||"—"}</span>
              </span>
              <span className="expense-tags" title={op.tags?.join(" · ")||"Sem tags"}>
                {op.tags?.length?op.tags.map(t=><span className="expense-tag-chip" key={t}>{"#"+t}</span>):"—"}
              </span>
            </div>)}
          </>}
        </section>;
      });
    })():fileEntries.map(({op,doc,key})=><div key={key}
      className={"operation-row operation-popup-row explorer-file-row"+(selected===key?" selected":"")}
      role="button" tabIndex={0}
      aria-label={(doc?displayName(doc,op):op.titulo)+(isAdmin?". Dois cliques para ações":doc?". Dois cliques para abrir o documento":". Sem documento")}
      title={isAdmin?"Duplo clique para opções do arquivo":doc?"Duplo clique para abrir o documento":"Lançamento sem documento"}
      onClick={()=>{setSelected(key);setMenu(null);}}
      onDoubleClick={e=>{activate(op.id,e.clientX,e.clientY,doc?.arquivo_id);setSelected(key);}}
      onContextMenu={e=>{if(isAdmin){e.preventDefault();show(op.id,e.clientX,e.clientY,doc?.arquivo_id);setSelected(key);}}}
      onKeyDown={e=>{
        if(e.key==="Enter"||e.key===" "){
          e.preventDefault();
          const b=e.currentTarget.getBoundingClientRect();
          activate(op.id,b.left+75,b.top+25,doc?.arquivo_id);
          setSelected(key);
        }
      }}>
      <span className="operation-name">
        <FileText size={15} className="explorer-document-icon"/>
        <span title={doc?displayName(doc,op):"Lançamento sem anexo — "+op.titulo}>
          {doc?displayName(doc,op):"Lançamento sem anexo — "+op.titulo}
        </span>
      </span>
      <span title={op.titulo}>{op.titulo}</span>
      <span>{op.data_pagamento?op.data_pagamento.split("-").reverse().join("/"):"—"}</span>
      <span className="explorer-file-value">{money(op.valor)||"—"}</span>
    </div>)}
    {operations.length===0&&<p className="empty-info">Nenhum lançamento para os filtros selecionados.</p>}
    {isAdmin&&menu&&current&&<div ref={popup} className="entity-actions-popup" role="dialog"
      aria-label={"Ações de "+current.titulo} style={{left:menu.x,top:menu.y}}
      onClick={e=>e.stopPropagation()}>
      <div className="entity-popup-header">
        {menu.view!=="actions"&&<button type="button" aria-label="Voltar às ações" onClick={()=>view("actions")}><ChevronLeft size={16}/></button>}
        <strong title={current.titulo}>{current.titulo}</strong>
        <button type="button" onClick={()=>setMenu(null)} aria-label="Fechar ações"><X size={16}/></button>
      </div>
      {menu.view==="actions"&&<div className="entity-popup-options">
        {menu.arquivoId&&<a href={"/api/documentos/"+menu.arquivoId+"?operacao="+current.id}
          target="_blank" rel="noopener noreferrer" onClick={()=>setMenu(null)}>
          <FileText size={15}/> Abrir documento original
        </a>}
        <button type="button" onClick={()=>view("info")}><Eye size={15}/> Detalhes do lançamento</button>
        {currentDocs.length>0&&<button type="button" onClick={()=>view("files")}>
          <FileText size={15}/> Documentos ({current.quantidade_documentos})
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
        <div><span>Tags</span><strong>{current.tags?.join(" · ")||"Sem tags"}</strong></div>
        <div><span>Competência</span><strong>{current.competencia.slice(0,7)}</strong></div>
        <div><span>Tipo</span><strong>{current.tipo}</strong></div>
        <div><span>Valor</span><strong>{money(current.valor)||"—"}</strong></div>
        <div><span>Contraparte</span><strong>{current.contraparte||"—"}</strong></div>
        <div><span>Referência</span><strong>{current.referencia||"—"}</strong></div>
        {current.descricao&&<p>{current.descricao}</p>}
      </div>}
      {menu.view==="files"&&<div className="entity-popup-options">
        {currentDocs.map(f=><a key={f.arquivo_id} href={"/api/documentos/"+f.arquivo_id+"?operacao="+current.id}
          target="_blank" rel="noopener noreferrer"><FileText size={15}/><span className="truncate">{displayName(f,current)}</span></a>)}
        {Number(current.quantidade_documentos)>currentDocs.length&&
          <Link href={"/operacoes/"+current.id} onClick={()=>setMenu(null)}>
            <FileText size={15}/> Ver todos os documentos
          </Link>}
      </div>}
      {menu.view==="move"&&<form className="entity-popup-form"
        action={"/api/operacoes/"+current.id+"/mover"} method="post">
        <p>Mover para outro livro autorizado. Se o arquivo for compartilhado com outros lançamentos, o sistema bloqueará a mudança para proteger os documentos.</p>
        <label>Novo titular
          <select name="destinoId" value={destination} onChange={e=>setDestination(e.target.value)}>
            <option value={bookId}>Selecione outro titular</option>
            {books.filter(b=>b.id!==bookId).map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <button type="submit" className="primary-btn" disabled={destination===bookId||!destination}>Mover lançamento</button>
      </form>}
      {menu.view==="delete"&&<form className="entity-popup-form" action={"/api/operacoes/"+current.id} method="post">
        <input type="hidden" name="acao" value="excluir"/>
        <p>Enviar <strong>{current.titulo}</strong> para a lixeira? O lançamento poderá ser restaurado.</p>
        <div className="entity-popup-confirm">
          <button type="button" className="flat-button" onClick={()=>view("actions")}>Cancelar</button>
          <button type="submit" className="primary-btn">Confirmar exclusão</button>
        </div>
      </form>}
    </div>}
  </div>;
}