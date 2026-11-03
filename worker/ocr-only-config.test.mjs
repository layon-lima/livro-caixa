import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=name=>readFile(new URL(name,root),"utf8");
test("O processamento OCR não depende de modelo de IA nem Ollama",async()=>{
 const worker=await read("worker/processor.mjs");
 for(const forbidden of ["analyzeWithOllama","OLLAMA_URL","OLLAMA_MODEL",
   "mergeOcrReview","fromOllama","timing.ia_ms","progresso_etapa='ia'"])
   assert.equal(worker.includes(forbidden),false,forbidden);
 assert.match(worker,/parseLocalDocument/);
 assert.match(worker,/learnedPixOwner/);
 assert.match(worker,/categoryFromApprovals/);
});
test("O worker foi desconectado da rede e variáveis do modelo",async()=>{
 const compose=await read("compose.yaml");
 assert.doesNotMatch(compose,/OLLAMA_|ia_central|qwen3/i);
 assert.match(compose,/worker:/);
 assert.match(compose,/zip-worker:/);
});
test("Clientes e testes antigos de IA foram removidos da imagem",async()=>{
 for(const path of ["worker/ollama-analyzer.mjs","worker/ollama-analyzer.test.mjs",
   "worker/ocr-ai-merge.mjs","worker/ocr-ai-merge.test.mjs"]){
   await assert.rejects(access(new URL(path,root)),{code:"ENOENT"});
 }
});
