import {test} from "node:test";
import assert from "node:assert/strict";
import {reimportDecision,reopenDiscardedDocument} from "../src/lib/reimport-discarded.ts";
const original={id:"1",titular_envio_id:"3",status:"pronto",
  armazenamento:"local",descartado_em:"2026-10-31T00:00:00Z"};

test("Documento descartado pode ser reenviado, mesmo se titular técnico do OCR mudou",()=>{
  assert.equal(reimportDecision(original,true),"restore");
  assert.equal(reimportDecision({...original,titular_envio_id:"2"},true),"restore");
});
test("Acesso não autorizado e original ocupado não contornam proteções",()=>{
  assert.equal(reimportDecision(original,false),"restricted");
  assert.equal(reimportDecision({...original,status:"processando"},true),"processing");
  assert.equal(reimportDecision({...original,descartado_em:null},true),"not_discarded");
});
test("Reenvio arquiva propostas antigas, conserva históricos e reabre a fila",async()=>{
  const queries=[];
  const cx={query:async(sql,params)=>{
    queries.push({sql,params});
    return {rowCount:sql.startsWith("SELECT")?0:1,rows:[]};
  }};
  assert.equal(await reopenDiscardedDocument(cx,"12",5,7),"reprocessado");
  assert.equal(queries.length,4);
  assert.match(queries[1].sql,/UPDATE propostas SET descartado_em/);
  assert.match(queries[2].sql,/UPDATE lote_itens SET arquivo_id=NULL/);
  assert.match(queries[3].sql,/status='aguardando'/);
  assert.deepEqual(queries[3].params,["12",5,7]);
});
test("Lançamento aprovado impede reimportação; nada é reaberto",async()=>{
  const queries=[];
  const cx={query:async(sql)=>{queries.push(sql);return {rowCount:1,rows:[]};}};
  assert.equal(await reopenDiscardedDocument(cx,"12",5,7),"ja_aprovado");
  assert.equal(queries.length,1);
});
