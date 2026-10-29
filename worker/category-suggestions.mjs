// IA e consultas públicas podem sugerir categorias ainda não cadastradas.
// Nunca grava em categorias: a criação acontece somente na aprovação.
const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim();
export function splitSuggestion(value){
  const raw=String(value||"").trim().replace(/\s+/g," ").slice(0,170);
  if(!raw||/^(OUTRAS?\s+DESPESAS?|RECEITAS?)$/i.test(raw))return null;
  const parts=raw.split(/\s*(?:>|→)\s*/);
  if(parts.length>2)return null;
  const [nome,subcategoria=""]=parts;
  if(!nome||nome.length>80||subcategoria.length>80||/[<>{}\[\]\r\n\t]/.test(raw))return null;
  return {nome,subcategoria};
}
export function existingCategory(value,categories){
  const parsed=splitSuggestion(value);
  if(!parsed)return null;
  return categories.find(c=>normalize(c.nome)===normalize(parsed.nome)&&
    normalize(c.subcategoria||"")===normalize(parsed.subcategoria))||null;
}
export function bestCategory(value,categories){
  const parsed=splitSuggestion(value);
  if(!parsed)return {existing:null,suggested:null};
  const existing=existingCategory(value,categories);
  return {existing:existing||null,suggested:existing?null:parsed};
}
