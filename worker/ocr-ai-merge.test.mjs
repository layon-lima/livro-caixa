import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOcrReview } from "./ocr-ai-merge.mjs";
import { approvedCategory,normalizeParty } from "./classification-learning.mjs";
test("Recebedor TOYO PALMAS, R$ 3.845,24 e categoria aprovada prevalecem",()=>{
 const o=[{titulo:"Pix — TOYO PALMAS",contraparte:"TOYO PALMAS",
  valor:"3.845,24",categoria:"Manutenção Fazenda",descricao:""}];
 const ai=[{titulo:"Pix — CIELO",contraparte:"CIELO IP S.A.",valor:"3.485,24",
  categoria:"Bancário > Transferências",descricao:"Peças automotivas"}];
 const [r]=mergeOcrReview(o,ai,{protectedPixReceiver:"TOYO PALMAS"});
 assert.equal(r.contraparte,"TOYO PALMAS");
 assert.equal(r.valor,"3.845,24");
 assert.equal(r.categoria,"Manutenção Fazenda");
 assert.equal(r.descricao,"Peças automotivas");
 assert.ok(r.avisos.some(x=>x.includes("valor")));
});
test("IA pode preencher campos ausentes",()=>{
 const [r]=mergeOcrReview([{tipo:"outro",categoria:"",valor:""}],
  [{tipo:"despesa",categoria:"Manutenção Fazenda",valor:"25,00"}]);
 assert.equal(r.tipo,"despesa");assert.equal(r.categoria,"Manutenção Fazenda");
 assert.equal(r.valor,"25,00");
});
test("Aprendizado recusa categorias conflitantes e normaliza",()=>{
 assert.equal(normalizeParty("Tôyo Palmas!"),"TOYO PALMAS");
 assert.equal(approvedCategory([{nome:"Manutenção Fazenda",aprovacoes:1}]),"Manutenção Fazenda");
 assert.equal(approvedCategory([
  {nome:"Manutenção Fazenda",aprovacoes:1},
  {nome:"Pagamento de Serviços",aprovacoes:1}]),"");
});
