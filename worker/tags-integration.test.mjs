import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const file=path=>readFile(new URL(path,root),"utf8");

test("Tags independentes de categoria e muitos-para-muitos",async()=>{
  const sql=await file("db/migrations/018_tags.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS tags/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS operacao_tags/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS proposta_tags/);
  assert.match(sql,/PRIMARY KEY\(operacao_id,tag_id\)/);
  assert.match(sql,/PRIMARY KEY\(proposta_id,tag_id\)/);
  assert.doesNotMatch(sql,/categoria_id|titular_id/);
});
test("Administração cria, renomeia, arquiva e restaura tags sem excluir vínculos",async()=>{
  const [route,admin]=await Promise.all([
    file("src/app/api/admin/tags/route.ts"),
    file("src/components/admin-console.tsx")
  ]);
  for(const action of ["criar","editar","excluir","restaurar"])
    assert.ok(route.includes('"'+action+'"'));
  assert.match(route,/UPDATE tags SET ativa=/);
  assert.doesNotMatch(route,/DELETE FROM tags/);
  assert.match(route,/sameOriginPost/);
  assert.match(route,/isAdmin/);
  assert.match(admin,/onClick=\{\(\)=>switchTab\("tags"\)\}/);
});
test("Manual, conferência e edição validam e armazenam tags",async()=>{
  for(const route of [
    "src/app/api/operacoes/route.ts",
    "src/app/api/operacoes/[id]/route.ts",
    "src/app/api/propostas/[id]/revisar/route.ts"
  ]){
    const src=await file(route);
    assert.match(src,/parseTagIds/);
    assert.match(src,/validateTags/);
    assert.match(src,/writeTags/);
  }
});
test("Tags da proposta são copiadas para operação na aprovação individual e em lote",async()=>{
  const [individual,bulk]=await Promise.all([
    file("src/app/api/propostas/[id]/revisar/route.ts"),
    file("src/app/api/propostas/aprovar/route.ts")
  ]);
  assert.match(individual,/copyProposalTags/);
  assert.match(bulk,/copyProposalTags/);
});
test("Tags podem ser filtradas no livro e exportadas em Excel",async()=>{
  const [report,ui,excel]=await Promise.all([
    file("src/lib/expense-report.ts"),
    file("src/components/expense-spreadsheet.tsx"),
    file("src/app/api/livros/[id]/planilha/excel/route.ts")
  ]);
  assert.match(report,/operacao_tags ot/);
  assert.match(report,/filters.tag/);
  assert.match(ui,/Filtrar por tag/);
  assert.match(excel,/"Tags"/);
});
