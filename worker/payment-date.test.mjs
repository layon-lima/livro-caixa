import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizePaymentDate,paymentDateFromText,verifiedPaymentDate} from "./payment-date.mjs";

test("Pix: data efetiva não é data de importação",()=>{
  const text="Comprovante de pagamento Pix\n28/10/2026 - 17:07:58\nValor: R$ 3.845,24\n"+
    "Dados de quem recebeu\nNome: TOYO PALMAS\nData do débito: 28/10/2026 - 17:07:55\n"+
    "Vencimento: 10/11/2026";
  assert.equal(paymentDateFromText(text,"comprovante"),"2026-10-28");
  assert.equal(verifiedPaymentDate(text,"comprovante","2026-11-10"),"2026-10-28");
});
test("Boleto emitido não comprova pagamento",()=>{
  const boleto="Boleto bancário\nData de emissão: 25/10/2026\nVencimento: 31/10/2026\nValor: 350,00";
  assert.equal(paymentDateFromText(boleto,"boleto"),"");
});
test("Cobrança quitada registra data de pagamento",()=>{
  const paid="Boleto pago\nVencimento: 31/10/2026\nData do pagamento: 29/10/2026";
  assert.equal(paymentDateFromText(paid,"boleto"),"2026-10-29");
});
test("Rejeita datas impossíveis",()=>{
  assert.equal(normalizePaymentDate("31/02/2026"),"");
  assert.equal(normalizePaymentDate("2026-02-29"),"");
});
