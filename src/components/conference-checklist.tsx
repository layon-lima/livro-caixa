"use client";

import {useState} from "react";
export function ConferenceChecklist({items}:{items:string[]}){
  const [checked,setChecked]=useState<string[]>([]);
  return <div className="conference-review-items" aria-label="Itens a conferir">
    {items.map(x=><label key={x} className={checked.includes(x)?"conference-reviewed":""}>
      <input type="checkbox" checked={checked.includes(x)}
        onChange={e=>setChecked(old=>e.target.checked?[...old,x]:old.filter(v=>v!==x))}/>
      <span>{x}</span>
    </label>)}
    <small>Marcação para acompanhar sua revisão; a aprovação continua manual.</small>
  </div>;
}
