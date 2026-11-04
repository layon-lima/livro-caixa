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
  const queue=buildZipQueue(entries,[]);
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
  const queue=buildZipQueue(entries,pending);
  assert.deepEqual(queue.map(x=>x.status),["pendente","processando","aguardando"]);
  assert.deepEqual(queue.map(x=>x.ordinal),[1,2,3]);
});
test("Proposta antiga de um PDF duplicado fica fora da fila elegível",()=>{
  const entries=[entry(1,"duplicado",{arquivo_id:"10",leitura_status:"pronto"})];
  const old=[{id:"99",arquivo_id:"10",titulo:"Documento velho",nome_titular:"Outro"}];
  assert.deepEqual(buildZipQueue(entries,old),[]);
});
test("Fila mantém múltiplas propostas pendentes, mas nunca inclui aprovadas ou descartadas",()=>{
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
  const q=buildZipQueue(entries,pending);
  assert.deepEqual(q.map(x=>x.status),["pendente","pendente"]);
});

test("Caso real: 49 entradas com 15 elegíveis entram todas na fila antes do OCR",()=>{
  const entries=[
    ...Array.from({length:15},(_,i)=>entry(i+1,"importado",{
      arquivo_id:String(100+i),
      leitura_status:i<3?"pronto":i<5?"processando":"aguardando"
    })),
    ...Array.from({length:32},(_,i)=>entry(16+i,"ja_aprovado",{
      arquivo_id:String(500+i),leitura_status:"pronto"
    })),
    ...Array.from({length:2},(_,i)=>entry(48+i,"erro",{erro:"Formato não suportado"}))
  ];
  const proposals=Array.from({length:3},(_,i)=>({
    id:String(200+i),arquivo_id:String(100+i),titulo:"Documento pronto "+(i+1),
    nome_titular:"Titular"
  }));
  const q=buildZipQueue(entries,proposals);
  assert.equal(q.length,15);
  assert.deepEqual(q.map(x=>x.status).slice(0,5),[
    "pendente","pendente","pendente","processando","processando"]);
  assert.ok(q.slice(5).every(x=>x.status==="aguardando"));
  assert.ok(q.every(x=>x.ordinal<=15));
});

test("Erro OCR sem proposta não é elegível para aprovação",()=>{
  const q=buildZipQueue([
    entry(1,"importado",{arquivo_id:"10",leitura_status:"erro",leitura_erro:"Falha OCR"}),
    entry(2,"importado",{arquivo_id:"11",leitura_status:"pronto",tem_pendente:false})
  ],[]);
  assert.deepEqual(q,[]);
});

test("Após aprovar 14 documentos, nenhum permanece na fila do ZIP",()=>{
  const entries=Array.from({length:14},(_,i)=>
    entry(i+1,"importado",{
      arquivo_id:String(i+100),leitura_status:"pronto",
      tem_aprovado:true,tem_pendente:false
    }));
  assert.deepEqual(buildZipQueue(entries,[]),[]);
});

test("Quando um arquivo tem várias partes, somente as partes não aprovadas ficam na fila",()=>{
  const entries=[entry(1,"importado",{
    arquivo_id:"55",leitura_status:"pronto",
    tem_aprovado:true,tem_pendente:true
  })];
  const pending=[{id:"202",arquivo_id:"55",titulo:"Parte ainda pendente",nome_titular:"Jonas"}];
  const queue=buildZipQueue(entries,pending);
  assert.equal(queue.length,1);
  assert.equal(queue[0].id,"202");
  assert.equal(queue[0].status,"pendente");
});

test("Um arquivo aprovado não volta à fila como aguardando/processando sem proposta",()=>{
  const entries=[entry(1,"importado",{
    arquivo_id:"55",leitura_status:"processando",
    tem_aprovado:true,tem_pendente:false
  })];
  assert.deepEqual(buildZipQueue(entries,[]),[]);
});
