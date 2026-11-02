// Categorias reconhecidas devem pertencer ao cadastro ativo, sem subcategorias.
const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim();
export function splitSuggestion(value){
  const nome=String(value||"").trim().replace(/\s+/g," ");
  if(!nome||nome.length>80||/[><{}\[\]\r\n\t→]/.test(nome)||
    /^(OUTRAS?\s+DESPESAS?|RECEITAS?)$/i.test(nome))return null;
  return {nome,subcategoria:""};
}
export function existingCategory(value,categories){
  const parsed=splitSuggestion(value);
  if(!parsed)return null;
  return categories.find(c=>normalize(c.nome)===normalize(parsed.nome))||null;
}
export function bestCategory(value,categories){
  const existing=existingCategory(value,categories);
  // IA não cadastra categorias novas por conta própria.
  return {existing:existing||null,suggested:null};
}
