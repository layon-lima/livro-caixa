import {test} from "node:test";
import assert from "node:assert/strict";
import {deflateRawSync} from "node:zlib";
import {eachZipDocument,listZipDocuments} from "../src/lib/zip-documents.ts";

function crc32(buffer){
  let crc=0xffffffff;
  for(const b of buffer){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function zipWithOne(name,content){
  const filename=Buffer.from(name);
  const data=Buffer.from(content);
  const packed=deflateRawSync(data);
  const crc=crc32(data);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);
  local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);
  local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);
  central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
  const offset=local.length+filename.length+packed.length;
  const directory=Buffer.concat([central,filename]);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([local,filename,packed,directory,end]);
}
test("O descompactador ZIP funciona em Node e entrega cada arquivo à fila",async()=>{
  const pdf=Buffer.from("%PDF-1.4\nDocumento de teste\n");
  const zip=zipWithOne("documentos/comprovante.pdf",pdf);
  const observed=[];
  await eachZipDocument(zip,async(name,content)=>{
    observed.push({name,text:content.toString("utf8")});
  },async(name,reason)=>{throw Error(name+": "+reason);});
  assert.deepEqual(observed,[{name:"comprovante.pdf",text:pdf.toString("utf8")}]);
});
test("ZIP sem PDF/XML/PNG/JPG não pode ser aceito silenciosamente",async()=>{
  const zip=zipWithOne("documentos/anotacao.txt",Buffer.from("teste"));
  let rejected="";
  await assert.rejects(
    eachZipDocument(zip,async()=>{throw Error("Não deveria extrair TXT");},
      async(_name,reason)=>{rejected=reason;}),
    /ZIP não contém/
  );
  assert.match(rejected,/Formato ignorado/);
});

test("Índice completo do ZIP fica disponível antes de descompactar os documentos",async()=>{
  const zip=zipWithOne("documentos/comprovante.pdf",Buffer.from("%PDF-1.4\nTeste\n"));
  const manifest=await listZipDocuments(zip);
  assert.deepEqual(manifest,[{ordem:1,nome:"comprovante.pdf"}]);
});
test("O índice inclui entradas não suportadas para informar erros na fila",async()=>{
  const zip=zipWithOne("documentos/anotacao.txt",Buffer.from("teste"));
  assert.deepEqual(await listZipDocuments(zip),[{ordem:1,nome:"anotacao.txt"}]);
});
