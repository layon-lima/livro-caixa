import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeCounterparty,normalizeReference,strongDuplicateKey} from "../src/lib/duplicate-identity.ts";

test("mesmo Pix continua único após renomear ou converter o PDF",()=>{
  const id="E60746948202610292031A5793FujebQ";
  assert.equal(strongDuplicateKey("comprovante",id),"PIX:"+id.toUpperCase());
  assert.equal(strongDuplicateKey("Pix",id.toLowerCase()),"PIX:"+id.toUpperCase());
  assert.equal(strongDuplicateKey("outro","  "+id+"  "),"PIX:"+id.toUpperCase());
});
test("NF-e exige chave completa e tipo adequado",()=>{
  const id="17261030442051000134550050000039091770412228";
  assert.equal(strongDuplicateKey("nota fiscal",id),"NFE:"+id);
  assert.equal(strongDuplicateKey("nota fiscal","NFe"+id),"NFE:"+id);
  assert.equal(strongDuplicateKey("comprovante",id),null);
  assert.equal(strongDuplicateKey("NF-e",id),"NFE:"+id);
  assert.equal(strongDuplicateKey("nota fiscal","3909"),null);
});
test("boletos requerem código completo; não usar referências curtas",()=>{
  assert.equal(strongDuplicateKey("boleto","12345678901234567890123456789012345678901234567"),"BOLETO:12345678901234567890123456789012345678901234567");
  assert.equal(strongDuplicateKey("boleto","123456"),null);
});
test("mesmo valor, fornecedor ou data não produz identificador forte",()=>{
  assert.equal(strongDuplicateKey("comprovante","R$ 2.000,00"),null);
  assert.equal(strongDuplicateKey("comprovante","29/10/2026"),null);
  assert.equal(strongDuplicateKey("comprovante","TXN123"),null);
});
test("normalização mantém a comparação de recebedores consistente",()=>{
  assert.equal(normalizeCounterparty("Auto Posto Barbósão LTDA"),normalizeCounterparty("AUTO POSTO BARBOSAO LTDA"));
  assert.equal(normalizeReference(" E60746948202610292031A5793FujebQ "),"E60746948202610292031A5793FUJEBQ");
});
