"use client";
import {useState} from "react";
type Category={id:string;nome:string};
export function ReviewCategoryPicker({cats,selectedId,suggestedName}:{
  cats:Category[];selectedId:string|null;suggestedName:string;suggestedSubcategory?:string;
}){
  const known=Boolean(selectedId&&cats.some(c=>c.id===selectedId));
  const proposed=Boolean(suggestedName&&!known);
  const [mode,setMode]=useState(known?selectedId!:"");
  const [name,setName]=useState(proposed?suggestedName:"");
  return <div className="review-category-picker">
    <label>Categoria
      <select name="categoriaId" value={mode} onChange={e=>setMode(e.target.value)}>
        <option value="">Sem categoria</option>
        {cats.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
        <option value="__new__">+ Criar uma categoria nova</option>
      </select>
    </label>
    {!known&&Boolean(selectedId)&&<small>Categoria anterior desativada. Escolha uma das categorias atuais.</small>}
    {proposed&&<small>Sugestão da IA: escolha uma categoria atual ou crie uma manualmente.</small>}
    {mode==="__new__"&&<div className="review-category-new">
      <label>Nome da nova categoria
        <input name="categoriaNovaNome" value={name} onChange={e=>setName(e.target.value)}
          required maxLength={80} placeholder="Nome da categoria"/>
      </label>
      <small>A nova categoria só será cadastrada após sua aprovação.</small>
    </div>}
  </div>;
}
