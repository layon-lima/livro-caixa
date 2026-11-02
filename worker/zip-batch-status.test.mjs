import {test} from "node:test";
import assert from "node:assert/strict";
import {describeZipEntry,summarizeZipBatch} from "../src/lib/zip-batch-status.ts";
const row=(status_entrada,other={})=>({
 ordem:1,nome_entrada:"comprovante.pdf",status_entrada,erro:"",
 arquivo_id:"10",leitura_status:"pronto",leitura_erro:null,
 tem_pendente:false,tem_aprovado:false,...other
});
test("ZIP com arquivos já aprovados não os declara aprovados neste lote",()=>{
 const entries=Array.from({length:11},(_,i)=>row("duplicado",{ordem:i+1,tem_aprovado:true}));
 const stats=summarizeZipBatch(entries);
 assert.equal(stats.done,0);
 assert.equal(stats.duplicate,11);
 assert.equal(stats.new,0);
 assert.equal(describeZipEntry(entries[0]).label,"Já aprovado antes");
});
test("Importados novos não desaparecem se o OCR ainda não criou propostas",()=>{
 const entry=row("importado",{leitura_status:"aguardando"});
 assert.equal(describeZipEntry(entry).group,"new");
 const after=row("importado",{leitura_status:"pronto"});
 assert.equal(describeZipEntry(after).group,"problem");
 assert.match(describeZipEntry(after).description,/não gerou proposta/);
});
test("Aprovações novas são distintas de arquivos antigos",()=>{
 assert.equal(describeZipEntry(row("importado",{tem_aprovado:true})).group,"done");
 assert.equal(describeZipEntry(row("reprocessado",{tem_pendente:true})).group,"new");
});
test("Falhas e formatos ignorados ficam visíveis",()=>{
 const entry=row("erro",{arquivo_id:null,erro:"Formato ignorado"});
 assert.equal(describeZipEntry(entry).group,"problem");
 assert.match(describeZipEntry(entry).description,/Formato ignorado/);
});
