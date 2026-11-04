import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("Conferência não duplica filtros ou botões inferiores",async()=>{
  const [page,queue]=await Promise.all([
    read("src/app/conferencia/page.tsx"),
    read("src/components/conference-queue.tsx")
  ]);
  assert.doesNotMatch(page,/<ZipBatchReport\b/);
  assert.doesNotMatch(page,/className="conference-action-bar"/);
  assert.doesNotMatch(queue,/cq-filters|Aprovar selecionados/);
  assert.match(queue,/placeholder="Buscar documento, titular ou referência"/);
});

test("Conferência oferece apenas Salvar e Descartar no rodapé",async()=>{
  const page=await read("src/app/conferencia/page.tsx");
  assert.match(page,/className="conference-header-actions"/);
  assert.doesNotMatch(page,/conference-save-menu|conference-save-options|Salvar para depois|Aprovar lançamento/);
  assert.match(page,/className="conference-bottom-actions"/);
  assert.ok(page.indexOf('className="conference-bottom-actions"')>page.indexOf('className="conference-text"'));
  assert.match(page,/form=\{formId\} name="acao" value="aprovar" className="primary-btn"/);
  assert.equal((page.match(/form=\{formId\} name="acao"/g)||[]).length,1);
  assert.match(page,/<DiscardDocument propostaId=\{selected.id\}[^\n]*compact\/>/);
  assert.match(page,/Abrir original/);
  assert.match(page,/Próximo/);
});
