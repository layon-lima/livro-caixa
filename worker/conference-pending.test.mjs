import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=p=>readFile(new URL(p,root),"utf8");
test("A conferência não consulta nem inclui lançamentos já aprovados no lote",async()=>{
  const page=await read("src/app/conferencia/page.tsx");
  const builder=await read("src/lib/zip-conference-queue.ts");
  assert.doesNotMatch(page,/const completed=lote/);
  assert.match(page,/buildZipQueue\(batchEntries,all\)/);
  assert.doesNotMatch(builder,/approvedByFile|status:"aprovado" as const/);
});
test("O botão global só conta pendências reais, sem duplicados ou aprovados",async()=>{
  const pending=await read("src/app/api/importar/pendentes/route.ts");
  assert.match(pending,/COUNT\(\*\) OVER\(\)::int AS total/);
  assert.match(pending,/p\.aprovado_em IS NULL/);
  assert.match(pending,/p\.duplicada_de IS NULL/);
  assert.match(pending,/p\.aprovado_em IS NOT NULL/);
  assert.match(pending,/return NextResponse\.json\(\{count:first\?\.total\|\|0,href\}/);
  assert.doesNotMatch(pending,/LIMIT 50/);
});
test("O contador é reconsultado após navegar/aprovar e ao voltar à aba",async()=>{
  const actions=await read("src/components/global-workspace-actions.tsx");
  const layout=await read("src/app/layout.tsx");
  assert.match(actions,/useSearchParams\(\)\.toString\(\)/);
  assert.match(actions,/\[context,pathname,searchKey\]/);
  assert.match(actions,/window\.addEventListener\("focus"/);
  assert.match(layout,/<Suspense fallback=\{null\}>/);
});
test("O painel ignora registros aprovados mesmo que uma consulta antiga os inclua",async()=>{
  const queue=await read("src/components/conference-queue.tsx");
  assert.match(queue,/const activeItems=useMemo/);
  assert.match(queue,/"aprovado","descartado","duplicado"/);
  assert.match(queue,/\{activeItems\.length\} documento\(s\) pendente\(s\)/);
});
