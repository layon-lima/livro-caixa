import type { PoolClient } from "pg";

// Grava aprendizado dentro da transação que efetiva a aprovação.
function normalizeParty(value:string):string{
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase()
    .replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim().slice(0,180);
}
export async function rememberApprovedClassification(cx:PoolClient,propostaId:string|number):Promise<void>{
  const found=await cx.query<{
    titular_id:string;categoria_id:string;contraparte:string;
  }>("SELECT titular_id::text,categoria_id::text,contraparte FROM propostas "+
    "WHERE id=$1 AND aprovado_em IS NOT NULL AND tipo='despesa' AND categoria_id IS NOT NULL",
    [propostaId]);
  const p=found.rows[0];if(!p)return;
  const key=normalizeParty(p.contraparte);
  if(key.length<4)return;
  await cx.query("INSERT INTO classificacoes_aprovadas "+
    "(proposta_id,titular_id,contraparte_chave,categoria_id) VALUES($1,$2,$3,$4) "+
    "ON CONFLICT (proposta_id) DO NOTHING",
    [propostaId,p.titular_id,key,p.categoria_id]);
}
