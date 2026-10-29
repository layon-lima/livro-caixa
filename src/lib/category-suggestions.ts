// Centraliza validação e reaproveitamento das categorias cadastradas.
// Novas sugestões ficam na proposta até a confirmação do usuário.
import type { PoolClient } from "pg";

export type SuggestedCategory={nome:string;subcategoria:string};

export function normalizeCategory(value:string){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim();
}
export function suggestedCategory(inputName:unknown,inputSubcategory:unknown):SuggestedCategory|null{
  const nome=String(inputName||"").trim().replace(/\s+/g," ");
  const subcategoria=String(inputSubcategory||"").trim().replace(/\s+/g," ");
  if(!nome||nome.length>80||subcategoria.length>80||
     /[<>{}\[\]\r\n\t]/.test(nome+subcategoria)||
     /^(OUTRAS?\s+DESPESAS?|RECEITAS?)$/i.test(nome))return null;
  return {nome,subcategoria};
}

export async function confirmedCategoryId(client:PoolClient,suggestion:SuggestedCategory):Promise<number>{
  // Serialização evita duas categorias quase idênticas geradas simultaneamente.
  await client.query("SELECT pg_advisory_xact_lock(731266202)");
  const list=await client.query<{id:string;nome:string;subcategoria:string}>(
    "SELECT id::text,nome,subcategoria FROM categorias ORDER BY id");
  const found=list.rows.find(c=>normalizeCategory(c.nome)===normalizeCategory(suggestion.nome)&&
    normalizeCategory(c.subcategoria)===normalizeCategory(suggestion.subcategoria));
  if(found)return Number(found.id);
  const result=await client.query<{id:string}>(
    "INSERT INTO categorias(nome,subcategoria) VALUES($1,$2) "+
    "ON CONFLICT(nome,subcategoria) DO UPDATE SET nome=EXCLUDED.nome RETURNING id::text",
    [suggestion.nome,suggestion.subcategoria]);
  return Number(result.rows[0].id);
}
