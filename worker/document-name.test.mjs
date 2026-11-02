import {test} from "node:test";
import assert from "node:assert/strict";
import {suggestDocumentName} from "../src/lib/document-name.ts";

test("Pix de posto vira arquivo de abastecimento sem alterar a extensão",()=>{
  assert.equal(suggestDocumentName({
    originalName:"Comprovante.pdf",documentType:"comprovante",
    title:"Comprovante Pix — AUTO POSTO BARBOSAO",
    counterparty:"AUTO POSTO BARBOSAO",category:"Combustíveis",
    subcategory:"Outros",paymentDate:"2026-10-28"
  }),"PIX ABASTECIMENTO AUTO POSTO BARBOSAO 28-10-2026.pdf");
});
test("Comprovante da Toyo Palmas utiliza peças, não nome de banco",()=>{
  assert.equal(suggestDocumentName({
    originalName:"comprovante.PDF",documentType:"comprovante",
    title:"Comprovante Pix — TOYO PALMAS",counterparty:"TOYO PALMAS",
    category:"Manutenção",subcategory:"Peças"
  }),"PIX PECAS TOYO PALMAS.pdf");
});
test("Boleto de fertilizante fica identificado mesmo sem IA",()=>{
  assert.equal(suggestDocumentName({
    originalName:"scan.pdf",documentType:"boleto",
    counterparty:"AGREX DO BRASIL LTDA",category:"Insumos Agrícolas",
    subcategory:"Fertilizantes"
  }),"BOLETO FERTILIZANTES AGREX DO BRASIL LTDA.pdf");
});
test("Sem identificação segura, preservar nome original",()=>{
  assert.equal(suggestDocumentName({originalName:"Comprovante.pdf",
    documentType:"comprovante",title:"Comprovante Pix"}),"Comprovante.pdf");
});
test("Não inventar abastecimento só porque é pagamento num posto",()=>{
  assert.equal(suggestDocumentName({originalName:"foto.png",
    documentType:"comprovante",title:"Pix",counterparty:"AUTO POSTO EXEMPLO",
    category:"Outras despesas"}),"PIX AUTO POSTO EXEMPLO.png");
});
test("Extensão do original permanece e caracteres inválidos são removidos",()=>{
  assert.equal(suggestDocumentName({originalName:"sem-nome.xml",documentType:"nota fiscal",
    counterparty:"Distribuidora / Norte: 01",category:"Insumos Agrícolas",
    subcategory:"Sementes"}),"NOTA FISCAL SEMENTES DISTRIBUIDORA NORTE 01.xml");
});
