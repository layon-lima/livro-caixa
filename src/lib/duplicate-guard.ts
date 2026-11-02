import "server-only";
import type {PoolClient} from "pg";
import {normalizeCounterparty,strongDuplicateKey} from "@/lib/duplicate-identity";

export type DuplicateInput={
  titularId:number;
  documentType?:string|null;
  reference?:string|null;
  paymentDate?:string|null;
  amount?:number|string|null;
  counterparty?:string|null;
  type?:string|null;
  excludeOperationId?:number|null;
};
export type DuplicateResult={
  level:"strong"|"similar";
  operationId:string;
  titularId:string;
  reason:string;
};
// Deve rodar SEMPRE dentro de BEGIN, antes da gravação do lançamento.
// Lock de escopo global para evitar dois POSTs simultâneos escaparem do SELECT.
export async function checkDuplicate(client:PoolClient,input:DuplicateInput):Promise<DuplicateResult|null>{
  const key=strongDuplicateKey(input.documentType,input.reference);
  const exclude=input.excludeOperationId||0;
  if(key){
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["lc:strong:"+key]);
    const [kind]=key.split(":");
    const identifier=key.slice(key.indexOf(":")+1);
    const matches=await client.query<{id:string;titular_id:string}>(
      "SELECT o.id::text,o.titular_id::text FROM operacoes o "+
      "WHERE o.excluido_em IS NULL AND o.id<>$3 AND ("+
      "o.chave_duplicidade=$1 OR ("+
      "regexp_replace(regexp_replace(upper(o.referencia),'[^A-Z0-9]','','g'),'^NFE','','')=$2 AND "+
      "($4='PIX' OR "+
      "($4='NFE' AND EXISTS(SELECT 1 FROM propostas p WHERE p.operacao_id=o.id AND "+
      "(lower(p.documento_tipo) LIKE '%nota fiscal%' OR lower(p.documento_tipo) LIKE '%nfe%'))) OR "+
      "($4='BOLETO' AND EXISTS(SELECT 1 FROM propostas p WHERE p.operacao_id=o.id "+
      "AND lower(p.documento_tipo) LIKE '%boleto%'))"+
      "))) ORDER BY o.id LIMIT 1",
      [key,identifier,exclude,kind]
    );
    if(matches.rows.length)return {
      level:"strong",operationId:matches.rows[0].id,
      titularId:matches.rows[0].titular_id,
      reason:"Identificador de documento ou transação já lançado."
    };
  }
  const party=normalizeCounterparty(input.counterparty);
  const amount=Number(input.amount);
  if(!input.paymentDate||!party||input.amount===null||input.amount===undefined||
     input.amount===""||!Number.isFinite(amount)||amount<=0||
     !["despesa","receita","outro"].includes(input.type||""))return null;
  // Lock por dados semelhantes impede que verificações concorrentes vejam
  // duas transações ainda não gravadas. Não transforma semelhança em bloqueio definitivo.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
    ["lc:similar:"+[input.titularId,input.paymentDate,amount.toFixed(2),party,input.type].join(":")]);
  const candidates=await client.query<{id:string;titular_id:string;contraparte:string;chave_duplicidade:string|null}>(
    "SELECT id::text,titular_id::text,contraparte,chave_duplicidade FROM operacoes "+
    "WHERE titular_id=$1 AND data_pagamento=$2 AND valor=$3::numeric AND tipo=$4 "+
    "AND excluido_em IS NULL AND id<>$5 ORDER BY id DESC LIMIT 100",
    [input.titularId,input.paymentDate,amount.toFixed(2),input.type,exclude]
  );
  const match=candidates.rows.find(row=>{
    if(normalizeCounterparty(row.contraparte)!==party)return false;
    // Duas transferências Pix com EndToEndId distintos são pagamentos distintos.
    if(key?.startsWith("PIX:")&&row.chave_duplicidade?.startsWith("PIX:")&&
      key!==row.chave_duplicidade)return false;
    return true;
  });
  return match?{
    level:"similar",operationId:match.id,titularId:match.titular_id,
    reason:"Mesmo titular, recebedor, valor e data de pagamento."
  }:null;
}
