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

test("Planilha mensal mostra grade Excel e cabeçalhos em cada mês",async()=>{
  const {readFile}=await import("node:fs/promises");
  const root=new URL("../",import.meta.url);
  const [ui,rows,css]=await Promise.all([
    readFile(new URL("src/components/expense-spreadsheet.tsx",root),"utf8"),
    readFile(new URL("src/components/operation-rows.tsx",root),"utf8"),
    readFile(new URL("src/app/globals.css",root),"utf8")
  ]);
  const header=ui.split("const monthlyColumnHeader=")[1]?.split('  return <div className="expense-sheet">')[0];
  assert.ok(header);
  for(const label of ["Data","Valor","Documento","Tipo","Categoria","Tags"])
    assert.ok(header.includes(label),label);
  assert.equal((header.match(/role="columnheader"/g)||[]).length,6);
  assert.match(ui,/columnHeader=\{monthlyColumnHeader\}/);
  assert.doesNotMatch(ui,/sortButton\("Recebedor"/);
  assert.match(rows,/\{!closed&&<>\s*\{columnHeader\}/);
  assert.match(rows,/className="expense-category"/);
  assert.match(rows,/className="expense-tags"/);
  assert.doesNotMatch(rows,/className="expense-strong" title=\{op.contraparte/);
  assert.match(css,/grid-template-columns:108px 132px minmax\(350px/);
  assert.match(css,/border-right:1px solid #c7d3e0/);
  assert.match(css,/border-bottom:1px solid #cbd6e2/);
});
