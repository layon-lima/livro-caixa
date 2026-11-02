// Modelo plano: uma categoria por lançamento, sem subcategoria.
import type {PoolClient} from "pg";
export type SuggestedCategory={nome:string;subcategoria:string};
export function normalizeCategory(value:string){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim();
}
export function suggestedCategory(inputName:unknown,_unused?:unknown):SuggestedCategory|null{
  const nome=String(inputName||"").trim().replace(/\s+/g," ");
  if(!nome||nome.length>80||/[<>{}\[\]\r\n\t→]/.test(nome)||
    /^(OUTRAS?\s+DESPESAS?|RECEITAS?)$/i.test(nome))return null;
  return {nome,subcategoria:""};
}
export async function confirmedCategoryId(client:PoolClient,suggestion:SuggestedCategory):Promise<number>{
  await client.query("SELECT pg_advisory_xact_lock(731266202)");
  const key=normalizeCategory(suggestion.nome);
  const list=await client.query<{id:string;nome:string}>(
    "SELECT id::text,nome FROM categorias WHERE ativa=TRUE AND subcategoria='' ORDER BY id");
  const found=list.rows.find(c=>normalizeCategory(c.nome)===key);
  if(found)return Number(found.id);
  const result=await client.query<{id:string}>(
    "INSERT INTO categorias(nome,subcategoria,ativa) VALUES($1,'',TRUE) "+
    "ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE RETURNING id::text",
    [suggestion.nome]);
  return Number(result.rows[0].id);
}
