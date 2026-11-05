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

test("Cada proposta mantém seu formulário independente ao navegar",async()=>{
  const page=await read("src/app/conferencia/page.tsx");
  assert.match(page,/className="conference-panel conference-edit" key=\{"review-"\+selected\.id\}/);
  assert.match(page,/<form key=\{selected\.id\} id=\{formId\}/);
  assert.match(page,/defaultValue=\{selected\.contraparte\}/);
  assert.match(page,/defaultValue=\{selected\.valor\|\|""\}/);
  assert.match(page,/defaultValue=\{selected\.titulo\}/);
  assert.match(page,/selectedTags=selectedTagRows\?\.rows\.map\(x=>x\.tag_id\)\|\|\[\]/);
});
test("Conferência mostra nomes originais e explicita os duplicados filtrados",async()=>{
  const [page,queue,zip,live]=await Promise.all([
    read("src/app/conferencia/page.tsx"),
    read("src/components/conference-queue.tsx"),
    read("src/lib/zip-conference-queue.ts"),
    read("src/components/live-review.tsx")
  ]);
  assert.match(page,/titulo:p\.nome_original/);
  assert.match(page,/const selectedName=selected\?\.nome_original\|\|""/);
  assert.match(page,/describeZipEntry\(entry\)/);
  assert.match(page,/p\.duplicada_de IS NOT NULL/);
  assert.match(page,/ignoredDuplicates=\{ignoredDuplicates\}/);
  assert.match(queue,/ignorad[o]\(s\) por duplicidade/);
  assert.match(queue,/item\.nome/);
  assert.match(queue,/item\.motivo/);
  assert.match(zip,/titulo:entry\.nome_entrada/);
  assert.match(live,/Nome original:/);
  assert.doesNotMatch(live,/\{proposedName\}/);
});

test("Duplicados são exibidos sem revelar arquivos de titulares sem permissão",async()=>{
  const [page,importPage]=await Promise.all([
    read("src/app/conferencia/page.tsx"),read("src/app/importar/page.tsx")
  ]);
  assert.match(page,/dupup\.user_id=\$2 AND dupup\.can_approve=true/);
  assert.match(page,/if\(!user\.isAdmin\)proposalDuplicateArgs\.push\(user\.id\)/);
  assert.match(importPage,/nome_sugerido:!file\.aprovado\|\|file\.propostas_quantidade>1\?file\.nome_original/);
});
