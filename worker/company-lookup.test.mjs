import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateNewOwner,confirmedPixReceiver } from "./company-lookup.mjs";
test("Toyo Palmas não é substituída pela Cielo",()=>{
 const doc=["Comprovante de pagamento Pix","Dados de quem recebeu","Nome: TOYO PALMAS",
 "Instituição: CIELO IP S.A.","Dados do pagamento","Valor: R$ 3.845,24",
 "Dados de quem pagou","Nome: JONAS NELMAR MARLOW"].join("\n");
 assert.equal(confirmedPixReceiver(doc),"TOYO PALMAS");
 assert.equal(candidateNewOwner(doc,"comprovante",["JONAS NELMAR MARLOW"]),"");
});
test("Novo titular apenas quando pagador está no documento",()=>{
 const doc="Comprovante Pix\nDados de quem pagou\nNome: PAGADOR DESCONHECIDO";
 assert.equal(candidateNewOwner(doc,"comprovante",[]),"PAGADOR DESCONHECIDO");
 assert.equal(candidateNewOwner(doc,"comprovante",["PAGADOR DESCONHECIDO"]),"");
});
