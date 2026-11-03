import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateNewOwner,confirmedPixReceiver,confirmedPixPayer,knownPixPayer } from "./company-lookup.mjs";
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

test("Pagador e recebedor Pix permanecem pessoas diferentes",()=>{
 const doc=["Comprovante de transferência Pix","Dados de quem recebeu",
  "Nome: TOYO PALMAS","Instituição: CIELO IP S.A.","Dados da transação",
  "Valor: R$ 3.845,24","Dados de quem fez a transação","Nome: JONAS NELMAR MARLOW"].join("\n");
 assert.equal(confirmedPixReceiver(doc),"TOYO PALMAS");
 assert.equal(confirmedPixPayer(doc),"JONAS NELMAR MARLOW");
 assert.equal(knownPixPayer(confirmedPixPayer(doc),[{id:"1",nome:"JONAS NELMAR MARLOW"}]).id,"1");
});
test("Pagador abreviado só corresponde a titular único",()=>{
 const books=[{id:"1",nome:"ANGELITA RABELO MARLOW"},{id:"2",nome:"JONAS NELMAR MARLOW"}];
 assert.equal(confirmedPixPayer("Comprovante Pix\nPagador: ANGELITA RABELO"),"ANGELITA RABELO");
 assert.equal(knownPixPayer("ANGELITA RABELO",books).id,"1");
 assert.equal(knownPixPayer("ANGELITA",books),null);
 assert.equal(candidateNewOwner("Pix realizado\nPagador: ANGELITA RABELO","comprovante",books.map(b=>b.nome)),"");
});
test("Não confunde recebedor com pagador",()=>{
 assert.equal(confirmedPixPayer("Comprovante Pix\nDados de quem recebeu\nNome: AUTO POSTO XYZ"),"");
});
test("Identifica pagador quando Nome está na linha seguinte",()=>{
 assert.equal(confirmedPixPayer("Comprovante Pix\nDados do pagador\nNome\nDAVI MARLOW\nCPF: 000\nDados de quem recebeu\nNome: POSTO"),"DAVI MARLOW");
});

test("OCR identifica titular em seções alternativas dos bancos sem confundir recebedor",()=>{
 const text=[
  "COMPROVANTE PIX","DADOS DO CLIENTE","Nome: ANGELINA RABELO",
  "CPF: ***.***.***-12","Dados de quem recebeu","Nome: AUTO POSTO AVENIDA",
  "Valor do pagamento: R$ 280,00"
 ].join("\n");
 assert.equal(confirmedPixPayer(text),"ANGELINA RABELO");
});
test("OCR reconhece pagador explicitamente indicado como titular da conta",()=>{
 const text="Comprovante Pix\nTitular da conta de origem: DAVI MARLOW\n"+
   "Favorecido: COMERCIAL XYZ LTDA";
 assert.equal(confirmedPixPayer(text),"DAVI MARLOW");
});
test("OCR não presume nome pelo recebedor sem contexto de origem",()=>{
 const text="Comprovante Pix\nDados de quem recebeu\nNome: DAVI MARLOW\n"+
   "Banco: BANCO EXEMPLO";
 assert.equal(confirmedPixPayer(text),"");
});
