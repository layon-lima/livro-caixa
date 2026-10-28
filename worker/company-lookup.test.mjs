import { test } from "node:test";
import assert from "node:assert/strict";
import { validCnpj, receiverCnpj, candidateNewOwner } from "./company-lookup.mjs";

const sample=[
  "PÁGINA 1 DE 1",
  "Comprovante de transferência Pix",
  "Dados de quem recebeu",
  "Nome: EMPRESA EXEMPLO LTDA",
  "CPF/CNPJ: 05.785.682/0001-09",
  "Dados da transação",
  "Valor: R$ 36.027,03",
  "Dados de quem fez a transação",
  "Nome: PAGADOR DESCONHECIDO",
  "CPF: ***.612.983-**"
].join("\n");

test("Busca pública recebe apenas CNPJ válido da seção recebedor",()=>{
  assert.equal(validCnpj("05.785.682/0001-09"),true);
  assert.equal(receiverCnpj(sample,"EMPRESA EXEMPLO LTDA","comprovante"),"05785682000109");
});
test("Ignora CNPJ inválido e CPF do pagador",()=>{
  assert.equal(validCnpj("11.111.111/1111-11"),false);
  const bad=sample.replace("05.785.682/0001-09","11.111.111/1111-11");
  assert.equal(receiverCnpj(bad,"EMPRESA EXEMPLO LTDA","comprovante"),"");
});
test("Sugerir novo titular só quando identificado como pagador",()=>{
  assert.equal(candidateNewOwner(sample,"comprovante",["OUTRO TITULAR"]),"PAGADOR DESCONHECIDO");
  assert.equal(candidateNewOwner(sample,"comprovante",["PAGADOR DESCONHECIDO"]),"");
});
test("Recebedor não deve ser sugerido como titular novo",()=>{
  const noPayer=sample.replace("Nome: PAGADOR DESCONHECIDO","");
  assert.equal(candidateNewOwner(noPayer,"comprovante",[]),"");
});
