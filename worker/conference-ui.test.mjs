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

test("Só cabeçalho oferece aprovação, salvar para depois e descarte",async()=>{
  const page=await read("src/app/conferencia/page.tsx");
  assert.match(page,/className="conference-header-actions"/);
  assert.match(page,/className="conference-save-menu"/);
  assert.match(page,/form=\{formId\} name="acao" value="aprovar"/);
  assert.match(page,/form=\{formId\} name="acao" value="salvar"/);
  assert.equal((page.match(/form=\{formId\} name="acao"/g)||[]).length,2);
  assert.match(page,/<DiscardDocument propostaId=\{selected.id\}/);
  assert.match(page,/Abrir original/);
  assert.match(page,/Próximo/);
});
