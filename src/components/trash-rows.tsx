"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";

type TrashItem={id:string;titulo:string;nome:string;competencia:string};
type Menu={id:string;x:number;y:number;confirm:boolean};
export function TrashRows({items}:{items:TrashItem[]}){
  const [selected,setSelected]=useState<string|null>(null);
  const [menu,setMenu]=useState<Menu|null>(null);
  const popup=useRef<HTMLDivElement>(null);
  const active=items.find(x=>x.id===menu?.id);
  useEffect(()=>{
    if(!menu)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setMenu(null);};
    const onClick=(event:globalThis.PointerEvent)=>{
      if(popup.current&&!popup.current.contains(event.target as Node))setMenu(null);
    };
    document.addEventListener("keydown",onKey);
    document.addEventListener("pointerdown",onClick);
    return ()=>{
      document.removeEventListener("keydown",onKey);
      document.removeEventListener("pointerdown",onClick);
    };
  },[menu]);
  function open(id:string,x:number,y:number){
    setSelected(id);
    setMenu({id,x:Math.max(8,Math.min(x,window.innerWidth-310)),
      y:Math.max(8,Math.min(y,window.innerHeight-220)),confirm:false});
  }
  return <div className="table-scroll">
    <table className="admin-table dense-table trash-table">
      <thead><tr><th>Operação</th><th>Titular</th><th>Competência</th></tr></thead>
      <tbody>{items.map(item=><tr key={item.id} tabIndex={0} role="button"
        aria-label={item.titulo+". Dois cliques para restaurar"}
        className={selected===item.id?"selected":""}
        title="Clique para selecionar; dois cliques para ações"
        onClick={()=>setSelected(item.id)}
        onDoubleClick={e=>open(item.id,e.clientX,e.clientY)}
        onContextMenu={e=>{e.preventDefault();open(item.id,e.clientX,e.clientY);}}
        onKeyDown={e=>{
          if(e.key==="Enter"||e.key===" "){
            e.preventDefault();const box=e.currentTarget.getBoundingClientRect();
            open(item.id,box.left+50,box.top+22);
          }
        }}>
        <td>{item.titulo}</td><td>{item.nome}</td><td>{item.competencia.slice(0,7)}</td>
      </tr>)}</tbody>
    </table>
    {!items.length&&<p className="muted">Nenhuma operação na lixeira.</p>}
    {menu&&active&&<div ref={popup} className="entity-actions-popup" role="dialog"
      aria-label={"Ações de "+active.titulo} style={{left:menu.x,top:menu.y}}>
      <div className="entity-popup-header">
        <strong>{active.titulo}</strong>
        <button type="button" aria-label="Fechar" onClick={()=>setMenu(null)}><X size={16}/></button>
      </div>
      {!menu.confirm?<div className="entity-popup-options">
        <button type="button" onClick={()=>setMenu(m=>m?{...m,confirm:true}:null)}>
          <RotateCcw size={15}/> Restaurar operação
        </button>
      </div>:<form className="entity-popup-form" action={"/api/operacoes/"+active.id} method="post">
        <input type="hidden" name="acao" value="restaurar"/>
        <p>Restaurar <strong>{active.titulo}</strong> ao livro de {active.nome}?</p>
        <div className="entity-popup-confirm">
          <button type="button" className="flat-button" onClick={()=>setMenu(m=>m?{...m,confirm:false}:null)}>
            Cancelar
          </button>
          <button type="submit" className="primary-btn">Restaurar</button>
        </div>
      </form>}
    </div>}
  </div>;
}