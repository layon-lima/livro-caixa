import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("Tema iOS moderno é compartilhado por todas as páginas",async()=>{
  const [layout,css]=await Promise.all([
    read("src/app/layout.tsx"),read("src/app/ios-surface.css")
  ]);
  assert.match(layout,/import "\.\/globals\.css";\s*import "\.\/ios-surface\.css";/);
  for(const selector of [
    ".rail-item-active",".content-header",".home-book-tile",
    ".admin-v2-panel",".conference-panel",".work-main.narrow-work",
    ".expense-month",".expense-footer"
  ])assert.ok(css.includes(selector),"Tema ausente: "+selector);
  assert.match(css,/backdrop-filter:blur/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test("Cada mês é card independente, com cinco colunas e filtros preservados",async()=>{
  const [css,spreadsheet,rows]=await Promise.all([
    read("src/app/ios-surface.css"),
    read("src/components/expense-spreadsheet.tsx"),
    read("src/components/operation-rows.tsx")
  ]);
  assert.match(css,/\.expense-month\s*\{[^}]*border-radius:17px;[^}]*box-shadow:/);
  assert.match(css,/\.expense-table-card\s*\{[^}]*background:transparent;/);
  assert.match(spreadsheet,/columnHeader=\{monthlyColumnHeader\}/);
  const header=spreadsheet.split("const monthlyColumnHeader=")[1]?.split('  return <div className="expense-sheet">')[0]||"";
  assert.equal((header.match(/role="columnheader"/g)||[]).length,5);
  for(const label of ["Data","Valor","Documento","Categoria","Tags"])
    assert.ok(header.includes(label),"Faltando "+label);
  assert.doesNotMatch(header,/>Tipo</);
  assert.match(rows,/className="expense-category-chip"/);
  assert.match(rows,/className="expense-tag-chip"/);
  assert.match(rows,/\{!closed&&<>\s*\{columnHeader\}/);
  assert.match(rows,/onDoubleClick=\{e=>show\(op.id,e.clientX,e.clientY\)\}/);
});
