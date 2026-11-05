import {test} from "node:test";
import assert from "node:assert/strict";
import {suggestDocumentName} from "../src/lib/document-name.ts";

test("Nome usa a descrição do lançamento e preserva a extensão",()=>{
  assert.equal(suggestDocumentName({
    originalName:"Comprovante.pdf",documentType:"comprovante",
    title:"Comprovante Pix — AUTO POSTO BARBOSAO",
    counterparty:"AUTO POSTO BARBOSAO",category:"Abastecimento",paymentDate:"2026-10-28"
  }),"Comprovante Pix — AUTO POSTO BARBOSAO.pdf");
});
test("Título tem prioridade sobre categoria e outros metadados",()=>{
  assert.equal(suggestDocumentName({
    originalName:"comprovante.PDF",documentType:"comprovante",
    title:"Comprovante Pix — TOYO PALMAS",counterparty:"TOYO PALMAS",
    category:"Manutenção Fazenda",description:"Peças automotivas"
  }),"Comprovante Pix — TOYO PALMAS.pdf");
});
test("Boleto de fertilizante fica identificado mesmo sem IA",()=>{
  assert.equal(suggestDocumentName({
    originalName:"scan.pdf",documentType:"boleto",
    counterparty:"AGREX DO BRASIL LTDA",category:"Compras Fazenda",description:"Fertilizante NPK"
  }),"Fertilizante NPK.pdf");
});
test("Sem identificação segura, preservar nome original",()=>{
  assert.equal(suggestDocumentName({originalName:"Comprovante.pdf",
    documentType:"comprovante",title:"Comprovante Pix"}),"Comprovante.pdf");
});
test("Não inventar abastecimento só porque é pagamento num posto",()=>{
  assert.equal(suggestDocumentName({originalName:"foto.png",
    documentType:"comprovante",title:"Pix",counterparty:"AUTO POSTO EXEMPLO",
    category:"Outras despesas"}),"PIX AUTO POSTO EXEMPLO.png");
});
test("Extensão do original permanece e caracteres inválidos são removidos",()=>{
  assert.equal(suggestDocumentName({originalName:"sem-nome.xml",documentType:"nota fiscal",
    counterparty:"Distribuidora / Norte: 01",category:"Compras Fazenda",description:"Compra de sementes"}),"Compra de sementes.xml");
});

test("Retroativo: lançamento antigo aprovado exibe o título confirmado",()=>{
  assert.equal(suggestDocumentName({
    originalName:"Comprovante.pdf",documentType:"comprovante",
    title:"Comprovante Pix — GUSTAVO HENRIQUE ALVES DE CARVALHO BATISTA"
  }),"Comprovante Pix — GUSTAVO HENRIQUE ALVES DE CARVALHO BATISTA.pdf");
});
test("Alterações posteriores do título atualizam o nome exibido",()=>{
  const doc={originalName:"Comprovante.pdf",documentType:"comprovante"};
  assert.equal(suggestDocumentName({...doc,title:"Pagamento aluguel novembro"}),
    "Pagamento aluguel novembro.pdf");
  assert.equal(suggestDocumentName({...doc,title:"Pagamento aluguel corrigido"}),
    "Pagamento aluguel corrigido.pdf");
});
test("Títulos genéricos aproveitam detalhes; caracteres proibidos são removidos",()=>{
  assert.equal(suggestDocumentName({
    originalName:"Comprovante.PDF",documentType:"comprovante",
    title:"Comprovante",description:"Aluguel: sede / novembro *2026*"
  }),"Aluguel sede novembro 2026.pdf");
});

test("Histórico com vários lançamentos recebe nome específico por operação",()=>{
  const historic="E60746948202610281555357938ZSTI.pdf";
  assert.equal(suggestDocumentName({
    originalName:historic,documentType:"comprovante",
    title:"Comprovante Pix — GUSTAVO HENRIQUE ALVES DE CARVALHO BATISTA",
    counterparty:"GUSTAVO HENRIQUE ALVES DE CARVALHO BATISTA"
  }),"Comprovante Pix — GUSTAVO HENRIQUE ALVES DE CARVALHO BATISTA.pdf");
});

test("Regressão: planilha e abertura incluem multi-propostas com nome por lançamento",async()=>{
  const {readFile}=await import("node:fs/promises");
  const root=new URL("../",import.meta.url);
  const [report,row,page,download]=await Promise.all([
    readFile(new URL("src/lib/expense-report.ts",root),"utf8"),
    readFile(new URL("src/components/operation-rows.tsx",root),"utf8"),
    readFile(new URL("src/app/operacoes/[id]/page.tsx",root),"utf8"),
    readFile(new URL("src/app/api/documentos/[id]/route.ts",root),"utf8")
  ]);
  assert.doesNotMatch(report,/row\.quantidade_no_arquivo\)\s*<=1\s*\?\s*suggestDocumentName/);
  assert.match(report,/documento:row\.documento\?suggestDocumentName/);
  assert.doesNotMatch(row,/Number\(doc\.quantidade_no_arquivo\)>1\?doc\.nome_original/);
  assert.match(row,/\?operacao="\+current\.id/);
  assert.doesNotMatch(page,/quantidade_no_arquivo>1\?f\.nome_original/);
  assert.match(page,/\?operacao="\+id/);
  assert.match(download,/oa\.arquivo_id=\$1 AND oa\.operacao_id=\$2/);
  assert.match(download,/operationName\|\|file\.propostas_quantidade===1/);
});
