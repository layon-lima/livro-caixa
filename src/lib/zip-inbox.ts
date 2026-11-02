import "server-only";
import {mkdir,writeFile,rename,unlink,statfs} from "node:fs/promises";
import {join} from "node:path";
const ROOT=process.env.LC_STORAGE_DIR||"/data/livro-caixa-arquivos";
const DIR=join(ROOT,"zip-pendentes");
const RESERVE=2_000_000_000;

export async function saveIncomingZip(lote:string,bytes:Buffer){
  if(!/^[a-f0-9-]{36}$/i.test(lote))throw Error("Identificador de lote inválido");
  const disk=await statfs(ROOT);
  if(disk.bavail*disk.bsize < bytes.length+RESERVE)
    throw Error("Espaço livre insuficiente para o ZIP");
  await mkdir(DIR,{recursive:true});
  // Nome temporário exclusivo evita que o worker leia um ZIP incompleto.
  const temp=join(DIR,lote+".part");
  const target=join(DIR,lote+".zip");
  try{
    await writeFile(temp,bytes,{flag:"wx",mode:0o600});
    await rename(temp,target);
  }catch(e){
    await unlink(temp).catch(()=>{});
    throw e;
  }
}
