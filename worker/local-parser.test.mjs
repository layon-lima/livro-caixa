import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDocument } from "./local-parser.mjs";

test("NF-e local extrai fornecedor, valor, categoria e data",()=>{
  const text="PÁGINA 1 DE 1\nDANFE - NOTA FISCAL ELETRÔNICA\n"+
  "EMITENTE: AGROEX LTDA\nNº NOTA: 99451\nDATA DE EMISSÃO: 12/08/2026\n"+
  "VALOR TOTAL DA NOTA R$ 5.250,00\nDESCRIÇÃO DO PRODUTO: FERTILIZANTE NPK";
  const [item]=parseLocalDocument(text,"nota.pdf","application/pdf");
  assert.equal(item.documento_tipo,"nota fiscal");
  assert.equal(item.contraparte,"AGROEX LTDA");
  assert.equal(item.valor,"5.250,00");
  assert.equal(item.competencia,"12/08/2026");
  assert.equal(item.categoria,"Insumos Agrícolas > Fertilizantes");
});
test("Boleto identifica beneficiário e valor sem escolher categoria fictícia",()=>{
  const [item]=parseLocalDocument(
    "PÁGINA 1 DE 1\nBOLETO\nBENEFICIÁRIO: COOPERATIVA ABC\nVENCIMENTO: 05/11/2026\nVALOR DO DOCUMENTO: R$ 1.234,56",
    "boleto.pdf","application/pdf");
  assert.equal(item.documento_tipo,"boleto");
  assert.equal(item.contraparte,"COOPERATIVA ABC");
  assert.equal(item.valor,"1.234,56");
  assert.equal(item.categoria,"");
});
test("Comprovante determina tipo quando há pagamento explícito",()=>{
  const [item]=parseLocalDocument(
    "PÁGINA 1 DE 1\nCOMPROVANTE DE PAGAMENTO PIX\nFAVORECIDO: JOSE DA SILVA\nDATA DO PAGAMENTO: 02/09/2026\nVALOR PAGO: R$ 75,00",
    "pix.pdf","application/pdf");
  assert.equal(item.documento_tipo,"comprovante");
  assert.equal(item.tipo,"despesa");
  assert.equal(item.valor,"75,00");
});
test("Não divide páginas repetidas da mesma nota",()=>{
  const key="12345678901234567890123456789012345678901234";
  const items=parseLocalDocument(
    "PÁGINA 1 DE 2\nNOTA FISCAL ELETRÔNICA\nCHAVE DE ACESSO: "+key+
    "\nPÁGINA 2 DE 2\nNOTA FISCAL ELETRÔNICA\nCHAVE DE ACESSO: "+key,
    "nota.pdf","application/pdf");
  assert.equal(items.length,1);
  assert.equal(items[0].pagina_final,2);
});
test("Separa notas diferentes por chaves fortes distintas",()=>{
  const items=parseLocalDocument(
    "PÁGINA 1 DE 2\nNOTA FISCAL ELETRÔNICA\nCHAVE DE ACESSO: 12345678901234567890123456789012345678901234"+
    "\nPÁGINA 2 DE 2\nNOTA FISCAL ELETRÔNICA\nCHAVE DE ACESSO: 98765432109876543210987654321098765432109876",
    "notas.pdf","application/pdf");
  assert.equal(items.length,2);
  assert.deepEqual(items.map(i=>[i.pagina_inicial,i.pagina_final]),[[1,1],[2,2]]);
});


test("Comprovante Pix bancario com duas secoes Nome identifica recebedor certo",()=>{
  const text=[
    "PÁGINA 1 DE 1",
    "Comprovante de transferência Pix",
    "28/10/2026 - 09:47:43",
    "Valor: R$ 36.027,03",
    "Dados de quem recebeu",
    "Nome: EMPRESA EXEMPLO LTDA",
    "CPF/CNPJ: 12.345.678/0001-90",
    "Dados da transação",
    "Tipo: Pix",
    "Data do débito: 28/10/2026",
    "Número de Controle: E60746948202610281247A5793TDHH7o",
    "Dados de quem fez a transação",
    "Nome: PAGADOR EXEMPLO"
  ].join("\n");
  const [item]=parseLocalDocument(text,"pix.pdf","application/pdf");
  assert.equal(item.documento_tipo,"comprovante");
  assert.equal(item.contraparte,"EMPRESA EXEMPLO LTDA");
  assert.equal(item.tipo,"despesa");
  assert.equal(item.valor,"36.027,03");
  assert.equal(item.competencia,"28/10/2026");
  assert.equal(item.referencia,"E60746948202610281247A5793TDHH7o");
});
