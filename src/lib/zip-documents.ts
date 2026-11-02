import yauzl, { type Entry, type ZipFile } from "yauzl";
import type { Readable } from "node:stream";

export const MAX_ZIP_BYTES=80*1024*1024;
const MAX_MEMBERS=300;
const MAX_DOCUMENT_BYTES=25*1024*1024;
const MAX_TOTAL_BYTES=500*1024*1024;
const formats=new Set(["pdf","xml","png","jpg","jpeg"]);

function openZip(data:Buffer):Promise<ZipFile>{
  return new Promise((resolve,reject)=>
    yauzl.fromBuffer(data,{lazyEntries:true,autoClose:false,validateEntrySizes:true},
      (error,zip)=>error||!zip?reject(error||new Error("ZIP inválido.")):resolve(zip)));
}
function nextEntry(zip:ZipFile):Promise<Entry|null>{
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{
      zip.off("entry",onEntry);zip.off("end",onEnd);zip.off("error",onError);
    };
    const onEntry=(entry:Entry)=>{cleanup();resolve(entry);};
    const onEnd=()=>{cleanup();resolve(null);};
    const onError=(error:Error)=>{cleanup();reject(error);};
    zip.once("entry",onEntry);zip.once("end",onEnd);zip.once("error",onError);
    zip.readEntry();
  });
}
async function readMember(zip:ZipFile,entry:Entry):Promise<Buffer>{
  const stream=await new Promise<Readable>((resolve,reject)=>
    zip.openReadStream(entry,(error,reader)=>
      error||!reader?reject(error||new Error("Entrada ZIP inválida.")):resolve(reader)));
  const parts:Buffer[]=[];
  let bytes=0;
  for await(const part of stream){
    const chunk=Buffer.isBuffer(part)?part:Buffer.from(part as Uint8Array);
    bytes+=chunk.length;
    if(bytes>MAX_DOCUMENT_BYTES) {
      stream.destroy();
      throw Error("Arquivo descompactado acima de 25 MB.");
    }
    parts.push(chunk);
  }
  if(bytes!==entry.uncompressedSize)throw Error("Tamanho ZIP inconsistente.");
  return Buffer.concat(parts,bytes);
}

/** Descompacta na memória um único membro de cada vez, sem extrair caminhos. */
export async function eachZipDocument(
  data:Buffer,
  onDocument:(name:string,content:Buffer)=>Promise<void>,
  onSkipped:(name:string,reason:string)=>Promise<void>
):Promise<void>{
  if(data.length>MAX_ZIP_BYTES||data.length<4)throw Error("ZIP inválido ou maior que 80 MB.");
  const zip=await openZip(data);
  let fatalError:Error|undefined;
  // Evita exceções não tratadas se um arquivo malformado emitir erro entre leituras.
  zip.on("error",(error:Error)=>{fatalError=error;});
  let members=0,total=0,recognized=0;
  try{
    for(;;){
      if(fatalError)throw fatalError;
      const entry=await nextEntry(zip);
      if(fatalError)throw fatalError;
      if(!entry)break;
      const full=entry.fileName;
      if(full.endsWith("/")||full.startsWith("__MACOSX/")||/\/(?:__MACOSX|\.DS_Store)(?:\/|$)/.test(full))continue;
      if(++members>MAX_MEMBERS)throw Error("ZIP acima do limite de 300 arquivos.");
      if(full.startsWith("/")||full.includes("\\")||full.split("/").some(part=>part===".."||part==="."||part===""))
        throw Error("ZIP possui nomes de arquivos ou caminhos inválidos.");
      const name=full.split("/").at(-1)||"";
      const ext=name.split(".").pop()?.toLowerCase()||"";
      if(!formats.has(ext)) {
        await onSkipped(name.slice(0,255),"Formato ignorado: envie PDF, XML, JPG ou PNG.");
        continue;
      }
      recognized++;
      if(!entry.uncompressedSize||entry.uncompressedSize>MAX_DOCUMENT_BYTES){
        await onSkipped(name.slice(0,255),"Arquivo vazio ou superior a 25 MB descompactado.");
        continue;
      }
      total+=entry.uncompressedSize;
      if(total>MAX_TOTAL_BYTES)throw Error("ZIP excede o limite de 500 MB descompactados.");
      const contents=await readMember(zip,entry);
      await onDocument(name.slice(0,255),contents);
    }
    if(!recognized)throw Error("ZIP não contém PDF, XML, JPG ou PNG para leitura.");
  }finally{zip.close();}
}
