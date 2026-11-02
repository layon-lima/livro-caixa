import {test} from "node:test";
import assert from "node:assert/strict";
import {buildZipQueue} from "../src/lib/zip-conference-queue.ts";

const entry=(index,status_entrada="pendente",extra={})=>({
  ordem:index,nome_entrada:"documento-"+index+".pdf",status_entrada,erro:"",
  arquivo_id:null,leitura_status:null,leitura_erro:null,
  tem_pendente:false,tem_aprovado:false,...extra
});

test("49 entradas visíveis imediatamente antes do OCR com 49 indisponíveis",()=>{
  const entries=Array.from({length:49},(_,i)=>entry(i+1));
  const queue=buildZipQueue(entries,[],[]);
  assert.equal(queue.length,49);
  assert.ok(queue.every(item=>item.status==="recebendo"));
  assert.equal(queue[0].titulo,"documento-1.pdf");
  assert.equal(queue[48].titulo,"documento-49.pdf");
});
test("Itens disponíveis ficam prontos, enquanto demais continuam opacos",()=>{
  const entries=[
    entry(1,"importado",{arquivo_id:"10",leitura_status:"pronto"}),
    entry(2,"importado",{arquivo_id:"11",leitura_status:"processando"}),
    entry(3,"importado",{arquivo_id:"12",leitura_status:"aguardando"})
  ];
  const pending=[{id:"100",arquivo_id:"10",titulo:"Pix",nome_titular:"Titular"}];
  const queue=buildZipQueue(entries,pending,[]);
  assert.deepEqual(queue.map(x=>x.status),["pendente","processando","aguardando"]);
  assert.deepEqual(queue.map(x=>x.ordinal),[1,2,3]);
});
test("Não expor proposta antiga de um PDF duplicado",()=>{
  const entries=[entry(1,"duplicado",{arquivo_id:"10",leitura_status:"pronto"})];
  const old=[{id:"99",arquivo_id:"10",titulo:"Documento velho",nome_titular:"Outro"}];
  const queue=buildZipQueue(entries,old,[]);
  assert.equal(queue.length,1);
  assert.equal(queue[0].status,"ja-existente");
  assert.equal(queue[0].titulo,"documento-1.pdf");
});
test("Não omitir erros, descartes, multi-propostas nem aprovados",()=>{
  const entries=[
    entry(1,"importado",{arquivo_id:"10",leitura_status:"pronto"}),
    entry(2,"erro",{erro:"Formato inválido"}),
    entry(3,"descartado"),
    entry(4,"importado",{arquivo_id:"20",leitura_status:"pronto"})
  ];
  const pending=[
    {id:"101",arquivo_id:"10",titulo:"Documento A",nome_titular:"A"},
    {id:"102",arquivo_id:"10",titulo:"Documento B",nome_titular:"A"}
  ];
  const approved=[{id:"201",arquivo_id:"20",operacao_id:"501",titulo:"Lançamento",nome_titular:"B"}];
  const q=buildZipQueue(entries,pending,approved);
  assert.deepEqual(q.map(x=>x.status),["pendente","pendente","erro","descartado","aprovado"]);
});
