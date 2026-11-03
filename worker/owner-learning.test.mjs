import {test} from "node:test";
import assert from "node:assert/strict";
import {knownOwnerByName,ownerMentionedInDocument,ownerFromApprovedPayers,learnedPixOwner} from "./owner-learning.mjs";
const owners=[{id:"1",nome:"JONAS NELMAR MARLOW"},{id:"2",nome:"ANGELITA RABELO MARLOW"},
  {id:"3",nome:"ANGELINA RABELO"},{id:"4",nome:"DAVI MARLOW"}];
test("Reconhece nome completo ou prefixo inequívoco",()=>{
 assert.equal(knownOwnerByName("Jonas Nelmar Marlow",owners)?.id,"1");
 assert.equal(knownOwnerByName("Angelita Rabelo",owners)?.id,"2");
 assert.equal(knownOwnerByName("Angelita",owners),null);
 assert.equal(knownOwnerByName("Davi Marlow",owners)?.id,"4");
});
test("Reconhece nome no OCR com pontuação e sem diferenciar acentos",()=>{
 assert.equal(ownerMentionedInDocument("Cliente: ANGELINA, RABELO. Documento emitido",owners)?.id,"3");
 assert.equal(ownerMentionedInDocument("Sem titular nomeado",owners),null);
});
test("Aprende alias de pagador somente de duas aprovações concordantes",()=>{
 const rows=[{titular_id:"1",pagador_identificado:"J. N. MARLOW"},
  {titular_id:"1",pagador_identificado:"J. N. MARLOW"}];
 assert.equal(ownerFromApprovedPayers(rows,"J. N. MARLOW",owners)?.id,"1");
 assert.equal(ownerFromApprovedPayers(rows.slice(0,1),"J. N. MARLOW",owners),null);
 assert.equal(ownerFromApprovedPayers([...rows,{titular_id:"2",pagador_identificado:"J. N. MARLOW"}],
   "J. N. MARLOW",owners),null);
});
test("Identificação direta não consulta banco; alias usa apenas histórico aprovado",async()=>{
 const never={query:async()=>{throw Error("Consulta indevida");}};
 assert.equal((await learnedPixOwner(never,"Davi Marlow",owners))?.id,"4");
 const db={query:async()=>({rows:[
  {titular_id:"2",pagador_identificado:"ANGELITA R."},
  {titular_id:"2",pagador_identificado:"ANGELITA R."}
 ]})};
 assert.equal((await learnedPixOwner(db,"ANGELITA R.",owners))?.id,"2");
});

test("Alias ambíguo em livro não autorizado não pode contaminar titular",()=>{
 const onlyOne=[owners[0]];
 const rows=[{titular_id:"1",pagador_identificado:"J. N. MARLOW"},
  {titular_id:"1",pagador_identificado:"J. N. MARLOW"},
  {titular_id:"3",pagador_identificado:"J. N. MARLOW"}];
 assert.equal(ownerFromApprovedPayers(rows,"J. N. MARLOW",onlyOne),null);
});
