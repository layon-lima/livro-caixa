import {test} from "node:test";
import assert from "node:assert/strict";
import {formatTransactionDate,documentTypeLabel} from "../src/lib/spreadsheet-fields.ts";

test("Mostra somente data efetiva da transação, sem inferir competência",()=>{
 assert.equal(formatTransactionDate("2026-01-01"),"01/01/2026");
 assert.equal(formatTransactionDate(null),"—");
 assert.equal(formatTransactionDate("2026-02-31"),"—");
 assert.equal(formatTransactionDate("2026-10"),"—");
});
test("Tipo reconhece Pix, nota fiscal e boleto",()=>{
 assert.equal(documentTypeLabel({documento_tipo:"comprovante",titulo:"Comprovante Pix — AUTO POSTO BARBOSAO",tem_documento:true}),"Pix");
 assert.equal(documentTypeLabel({documento_tipo:"nota fiscal",tem_documento:true}),"NF-e");
 assert.equal(documentTypeLabel({documento_tipo:"boleto",tem_documento:true}),"Boleto");
 assert.equal(documentTypeLabel({documento_tipo:"comprovante",tem_documento:true}),"Comprovante");
 assert.equal(documentTypeLabel({documento_tipo:"outro",tem_documento:false}),"Manual");
});
