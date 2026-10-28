import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOllamaOutput, partialOllamaFields } from "./ollama-analyzer.mjs";

const options={
  text:"PÁGINA 1 DE 1\nComprovante de transferência Pix\n28/10/2026\n"+
    "Dados de quem recebeu\nNome: ARMAZEM SL LTDA\nValor R$ 36.027,03\n"+
    "Dados de quem fez a transação\nNome: ANGELITA RABELO MARLOW",
  categories:["Insumos Agrícolas > Fertilizantes","Bancário > Transferências"],
  owners:[{id:"1",nome:"ANGELITA RABELO MARLOW"},{id:"2",nome:"JONAS NELMAR MARLOW"}],
  maxPages:1
};

test("validar extração estruturada e correspondência de titular",()=>{
  const data={itens:[{titulo:"Pix para ARMAZEM SL LTDA",documento_tipo:"comprovante",
    contraparte:"ARMAZEM SL LTDA",competencia:"2026-10",
    categoria:"Bancário > Transferências",tipo:"despesa",
    descricao:"Pagamento Pix",valor:"36027.03",referencia:"E6074694",
    titular_id:"1",pagina_inicial:1,pagina_final:1,confianca:0.85,avisos:[]}]};
  const [result]=parseOllamaOutput(JSON.stringify(data),options);
  assert.equal(result.titular_id,"1");
  assert.equal(result.valor,"36027.03");
  assert.equal(result.categoria,"Bancário > Transferências");
  assert.equal(result.confianca,0.8);
});

test("não aceitar titular inventado ou categoria inexistente",()=>{
  const data={itens:[{titulo:"Pix",documento_tipo:"comprovante",
    categoria:"Categoria inventada",titular_id:"2",
    valor:"R$ 36.027,03",pagina_inicial:1,pagina_final:1}]};
  const [result]=parseOllamaOutput(JSON.stringify(data),options);
  assert.equal(result.categoria,"");
  assert.equal(result.titular_id,"");
  assert.ok(result.avisos.length>=2);
});

test("recusar separação com páginas sobrepostas",()=>{
  const data={itens:[{titulo:"Primeiro",pagina_inicial:1,pagina_final:1},
    {titulo:"Segundo",pagina_inicial:1,pagina_final:1}]};
  assert.equal(parseOllamaOutput(JSON.stringify(data),options),null);
});

test("recusar resposta que não é JSON",()=>{
  assert.equal(parseOllamaOutput("Texto livre",options),null);
});

test("Campos completos chegam antes do JSON inteiro: nao usa campo parcial",()=>{
  const partial='{"itens":[{"titulo":"Comprovante Pix","documento_tipo":"comprovante","contraparte":"EMPRESA EXEMPLO","valor":"36027.03","descricao":"Aguardan';
  const found=partialOllamaFields(partial,{
    categories:options.categories,owners:options.owners,text:options.text
  });
  assert.equal(found.titulo,"Comprovante Pix");
  assert.equal(found.contraparte,"EMPRESA EXEMPLO");
  assert.equal(found.valor,"36027.03");
  assert.equal(found.descricao,undefined);
});
test("Nao publica titular sem nome completo no OCR",()=>{
  const raw='{"itens":[{"titular_id":"2","categoria":"Outra categoria","competencia":"2026-10"}]}';
  const found=partialOllamaFields(raw,{
    categories:options.categories,owners:options.owners,text:options.text
  });
  assert.equal(found.titular_id,undefined);
  assert.equal(found.categoria,undefined);
  assert.equal(found.competencia,"2026-10");
});
