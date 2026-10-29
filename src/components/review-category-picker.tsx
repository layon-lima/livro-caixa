"use client";
import { useState } from "react";

type Category={id:string;nome:string;subcategoria:string};
export function ReviewCategoryPicker({cats,selectedId,suggestedName,suggestedSubcategory}:{
  cats:Category[];selectedId:string|null;suggestedName:string;suggestedSubcategory:string;
}){
  // ID conhecido tem prioridade sobre sugestão residual.
  const [mode,setMode]=useState(selectedId|| (suggestedName?"__new__":""));
  const [name,setName]=useState(suggestedName||"");
  const [sub,setSub]=useState(suggestedSubcategory||"");
  const isNew=mode==="__new__";
  return <div className="review-category-picker">
    <label>Categoria
      <select name="categoriaId" value={mode} onChange={e=>setMode(e.target.value)}>
        <option value="">Sem categoria</option>
        {cats.filter(c=>c.nome.toLowerCase()!=="receitas").map(c=>
          <option key={c.id} value={c.id}>{c.nome}{c.subcategoria?" → "+c.subcategoria:""}</option>)}
        <option value="__new__">+ Criar uma categoria nova</option>
      </select>
    </label>
    {isNew&&<div className="review-category-new">
      <label>Nome da categoria
        <input name="categoriaNovaNome" value={name} onChange={e=>setName(e.target.value)}
          required maxLength={80} placeholder="Ex.: Veículos"/>
      </label>
      <label>Subcategoria (opcional)
        <input name="categoriaNovaSubcategoria" value={sub} onChange={e=>setSub(e.target.value)}
          maxLength={80} placeholder="Ex.: Pneus"/>
      </label>
      <small>Categoria sugerida. Será adicionada ao cadastro somente após sua aprovação.</small>
    </div>}
  </div>;
}
