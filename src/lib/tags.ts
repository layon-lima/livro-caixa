import "server-only";
import type {PoolClient} from "pg";
import {getDatabase} from "@/lib/database";
export type Tag={id:string;nome:string;ativa:boolean};
export async function tagsDisponiveis():Promise<Tag[]>{
  const r=await getDatabase().query<Tag>(
    "SELECT id::text,nome,ativa FROM tags WHERE ativa=TRUE ORDER BY nome"
  );
  return r.rows;
}
export function parseTagIds(form:FormData):number[]|null{
  const raw=form.getAll("tagIds");
  if(raw.length>100)return null;
  const ids=new Set<number>();
  for(const input of raw){
    const value=String(input);
    if(!/^[1-9]\d{0,15}$/.test(value))return null;
    const id=Number(value);
    if(!Number.isSafeInteger(id))return null;
    ids.add(id);
  }
  return [...ids];
}
export async function validateTags(cx:PoolClient,ids:number[]):Promise<boolean>{
  if(!ids.length)return true;
  const r=await cx.query<{id:string}>(
    "SELECT id::text FROM tags WHERE id=ANY($1::bigint[]) AND ativa=TRUE",[ids]);
  return r.rows.length===ids.length;
}
export async function writeTags(cx:PoolClient,entity:"operacao"|"proposta",id:number,tags:number[]):Promise<void>{
  const table=entity==="operacao"?"operacao_tags":"proposta_tags";
  const key=entity==="operacao"?"operacao_id":"proposta_id";
  // Preserva vínculos históricos de etiquetas arquivadas ao editar uma operação.
  await cx.query(
    "DELETE FROM "+table+" et USING tags t WHERE et."+key+"=$1 "+
    "AND t.id=et.tag_id AND t.ativa=TRUE",[id]);
  if(tags.length)await cx.query(
    "INSERT INTO "+table+"("+key+",tag_id) SELECT $1,unnest($2::bigint[]) ON CONFLICT DO NOTHING",
    [id,tags]);
}
export async function copyProposalTags(cx:PoolClient,propostaId:number,operacaoId:number){
  await cx.query(
    "INSERT INTO operacao_tags(operacao_id,tag_id) "+
    "SELECT $1,tag_id FROM proposta_tags WHERE proposta_id=$2 "+
    "ON CONFLICT DO NOTHING",[operacaoId,propostaId]);
}
