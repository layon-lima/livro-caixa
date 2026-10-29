import { test } from "node:test";
import assert from "node:assert/strict";
import { validCnpj, receiverCnpj, candidateNewOwner, confirmedPixReceiver, suggestCategoryFromCompany } from "./company-lookup.mjs";

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


test("Pix Toyo Palmas: recebedor é a loja, não a Cielo",()=>{
  const doc=[
    "Comprovante de pagamento Pix",
    "Dados de quem recebeu",
    "Nome: TOYO PALMAS",
    "CPF/CNPJ: 02.053.341/0001-50",
    "Instituição: CIELO IP S.A.",
    "Dados do pagamento",
    "Tipo: Pix",
    "Valor: R$ 123,45",
    "Dados de quem pagou",
    "Nome: PAGADOR TESTE"
  ].join("\n");
  assert.equal(confirmedPixReceiver(doc),"TOYO PALMAS");
  assert.equal(receiverCnpj(doc,"TOYO PALMAS","comprovante"),"02053341000150");
  assert.equal(candidateNewOwner(doc,"comprovante",["PAGADOR TESTE"]),"");
});

test("Categoria por CNAE: sugere Manutenção > Peças sem exigir nota fiscal",()=>{
  const publicCompany={
    razao_social:"TOYO PALMAS SERVICOS E PECAS AUTOMOTIVAS LTDA",
    nome_fantasia:"TOYO PALMAS",
    atividade:"Comércio a varejo de peças e acessórios novos para veículos automotores",
    codigo_cnae:"4530703"
  };
  const categories=[{nome:"Manutenção",subcategoria:"Peças"},
    {nome:"Manutenção",subcategoria:"Serviços"}];
  assert.equal(suggestCategoryFromCompany(publicCompany,categories),"Manutenção > Peças");
  assert.equal(suggestCategoryFromCompany(publicCompany,[{nome:"Outras despesas",subcategoria:""}]),"Manutenção > Peças");
});
