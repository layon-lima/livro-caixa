"use client";
import {useMemo,useState} from "react";
import {Tag as TagIcon,Search} from "lucide-react";
type Tag={id:string;nome:string};
export function TagPicker({tags,selected=[],disabled=false}:{tags:Tag[];selected?:string[];disabled?:boolean}){
  const [chosen,setChosen]=useState<string[]>(selected);
  const [search,setSearch]=useState("");
  const filtered=useMemo(()=>tags.filter(t=>t.nome.toLocaleLowerCase("pt-BR")
    .includes(search.trim().toLocaleLowerCase("pt-BR"))),[tags,search]);
  return <fieldset className="lc-tags-picker" disabled={disabled}>
    <legend><TagIcon size={14}/> Tags <span>(opcionais, independentes da categoria)</span></legend>
    {chosen.map(id=><input type="hidden" name="tagIds" key={id} value={id}/>)}
    {!tags.length?<small>Nenhuma tag cadastrada. Crie tags na Administração.</small>:<>
      {tags.length>12&&<label className="lc-tags-search">
        <Search size={14}/>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Pesquisar tags" aria-label="Pesquisar tags" type="search"/>
      </label>}
      <div className="lc-tags-list">
        {filtered.map(tag=>{
          const checked=chosen.includes(tag.id);
          return <button type="button" key={tag.id}
            aria-pressed={checked} className={"lc-tag-choice"+(checked?" selected":"")}
            onClick={()=>setChosen(old=>checked?old.filter(x=>x!==tag.id):[...old,tag.id])}>
            {checked?"✓ ":"+ "}{tag.nome}
          </button>;
        })}
      </div>
      {!filtered.length&&<small>Nenhuma tag encontrada.</small>}
    </>}
  </fieldset>;
}
