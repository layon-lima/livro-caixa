// Serviço independente: descompacta os ZIPs no volume compartilhado, item por item.
// O app confirma o envio imediatamente; o OCR principal permanece separado.
import {Pool} from "pg";
import {eachZipDocument,listZipDocuments} from "../src/lib/zip-documents.ts";
import {reimportDecision,reopenDiscardedDocument} from "../src/lib/reimport-discarded.ts";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {readFile,writeFile,mkdir,unlink,stat,statfs} from "node:fs/promises";
import {dirname,join} from "node:path";

const db=new Pool({host:process.env.PGHOST,user:process.env.PGUSER,
  password:process.env.PGPASSWORD,database:process.env.PGDATABASE,
  max:4,connectionTimeoutMillis:15000});
const ROOT=process.env.LC_STORAGE_DIR||"/data/livro-caixa-arquivos";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MAX_DOC=25*1024*1024;
const reserve=2_000_000_000;
const limit=20_000_000_000;
const mimes={pdf:"application/pdf",xml:"application/xml",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png"};
const filename=lote=>join(ROOT,"zip-pendentes",lote+".zip");

async function storeDocument(job,name,buffer){
  const ext=name.split(".").pop()?.toLowerCase()||"";
  const mime=mimes[ext];
  if(!mime||buffer.length===0||buffer.length>MAX_DOC)
    return {status:"erro",error:"Documento inválido ou acima de 25 MB."};
  const valid=ext==="pdf"?buffer.subarray(0,5).toString("ascii")==="%PDF-":
    ext==="png"?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    ext==="jpg"||ext==="jpeg"?buffer[0]===255&&buffer[1]===216:
    buffer.subarray(0,2048).toString("utf8").includes("<");
  if(!valid)return {status:"erro",error:"Conteúdo não corresponde ao formato do documento."};
  const sha=createHash("sha256").update(buffer).digest("hex");
  const cx=await db.connect();
  try{
    await cx.query("BEGIN");
    // Mesmo lock do upload comum; garante deduplicação e cota consistentes.
    await cx.query("SELECT pg_advisory_xact_lock(731266201)");
    const existing=await cx.query(
      "SELECT id::text,titular_envio_id::text,status,armazenamento,descartado_em "+
      "FROM arquivos WHERE sha256=$1 FOR UPDATE",[sha]);
    const original=existing.rows[0];
    if(original){
      if(original.descartado_em){
        // O titular técnico pode ter sido identificado/alterado pelo OCR no
        // primeiro envio. Desde que o usuário tenha acesso a ambos os livros,
        // um descarte não é impedimento para uma nova conferência.
        const oldAccess=await cx.query(
          "SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND u.is_active AND "+
          "(u.is_admin OR EXISTS(SELECT 1 FROM user_titular_permissions p "+
          "WHERE p.user_id=u.id AND p.titular_id=$2 AND "+
          "(p.can_import OR p.can_approve)))) AS autorizado",
          [job.enviado_por,original.titular_envio_id]);
        const decision=reimportDecision(original,Boolean(oldAccess.rows[0]?.autorizado));
        if(decision==="restore"){
          const outcome=await reopenDiscardedDocument(
            cx,original.id,Number(job.titular_envio_id),Number(job.enviado_por));
          await cx.query("COMMIT");
          return outcome==="reprocessado"?
            {status:"reprocessado",id:original.id}:{status:"ja_aprovado",id:original.id};
        }
        await cx.query("COMMIT");
        return decision==="processing"?
          {status:"erro",error:"Descarte anterior ainda em processamento; reenvie após finalizar."}:
          {status:"duplicado_restrito"};
      }
      // Não reutilizar dados de um titular ao qual o usuário não tem acesso.
      const allowed=await cx.query(
        "SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND u.is_active AND "+
        "(u.is_admin OR EXISTS(SELECT 1 FROM user_titular_permissions p "+
        "WHERE p.user_id=u.id AND p.titular_id=$2 AND p.can_approve))) AS autorizado",
        [job.enviado_por,original.titular_envio_id]);
      if(!allowed.rows[0]?.autorizado){
        await cx.query("COMMIT");return {status:"duplicado_restrito"};
      }
      const approved=await cx.query(
        "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND aprovado_em IS NOT NULL LIMIT 1",
        [original.id]);
      if(!approved.rowCount&&["pronto","erro"].includes(original.status)&&
         original.titular_envio_id===String(job.titular_envio_id)&&
         original.armazenamento==="local"){
        const reviewed=await cx.query(
          "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND "+
          "(revisada_em IS NOT NULL OR aprovado_em IS NOT NULL) AND descartado_em IS NULL LIMIT 1",
          [original.id]);
        if(!reviewed.rowCount){
          await cx.query("DELETE FROM propostas WHERE arquivo_id=$1 AND descartado_em IS NULL",
            [original.id]);
          await cx.query("UPDATE arquivos SET status='aguardando',"+
            "progresso_etapa='aguardando',progresso_dados='{}'::jsonb,"+
            "erro=NULL,texto_extraido='',atualizado_em=now() WHERE id=$1",[original.id]);
          await cx.query("COMMIT");
          return {status:"reprocessado",id:original.id};
        }
      }
      await cx.query("COMMIT");
      return {status:approved.rowCount?"ja_aprovado":"duplicado",id:original.id};
    }
    const compressed=gzipSync(buffer,{level:6});
    const key="originais/"+sha.slice(0,2)+"/"+sha+".gz";
    const path=join(ROOT,key);
    const used=await cx.query(
      "SELECT COALESCE(SUM(bytes_armazenados),0)::bigint AS bytes "+
      "FROM arquivos WHERE armazenamento='local'");
    if(Number(used.rows[0].bytes)+compressed.length>limit)
      throw Error("Limite de armazenamento dos documentos atingido.");
    const disk=await statfs(ROOT);
    if(disk.bavail*disk.bsize<compressed.length+reserve)
      throw Error("Espaço livre insuficiente na VPS.");
    await mkdir(dirname(path),{recursive:true});
    try{
      await writeFile(path,compressed,{flag:"wx",mode:0o600});
    }catch(error){
      if(error?.code!=="EEXIST")throw error;
      // Órfão de uma transação interrompida: verificar antes de reutilizar.
      const stored=gunzipSync(await readFile(path));
      if(!stored.equals(buffer))throw Error("Conflito no armazenamento do documento.");
    }
    const added=await cx.query(
      "INSERT INTO arquivos(sha256,chave_armazenamento,nome_original,mime,bytes,"+
      "bytes_armazenados,armazenamento,compressao,titular_envio_id,enviado_por) "+
      "VALUES($1,$2,$3,$4,$5,$6,'local','gzip',$7,$8) RETURNING id::text",
      [sha,key,name,mime,buffer.length,compressed.length,job.titular_envio_id,job.enviado_por]);
    await cx.query("COMMIT");
    return {status:"importado",id:added.rows[0].id};
  }catch(error){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Falha no documento do ZIP",job.id,name,error);
    return {status:"erro",error:String(error instanceof Error?error.message:error).slice(0,200)};
  }finally{cx.release();}
}
async function claim(){
  const cx=await db.connect();
  try{
    await cx.query("BEGIN");
    const row=await cx.query(
      "SELECT id::text,enviado_por::text,titular_envio_id::text,nome_arquivo "+
      "FROM lotes_importacao WHERE titular_envio_id IS NOT NULL AND zip_pronto=TRUE "+
      "AND (status='recebendo' OR "+
      "(status='extraindo' AND atualizado_em<now()-interval '15 minutes')) "+
      "ORDER BY criado_em FOR UPDATE SKIP LOCKED LIMIT 1");
    if(!row.rows.length){await cx.query("COMMIT");return null;}
    const job=row.rows[0];
    await cx.query("UPDATE lotes_importacao SET status='extraindo',"+
      "atualizado_em=now(),erro='' WHERE id=$1",[job.id]);
    await cx.query("COMMIT");
    return job;
  }catch(e){await cx.query("ROLLBACK").catch(()=>{});throw e;}
  finally{cx.release();}
}
async function record(job,ordinal,name,result){
  await db.query(
    "INSERT INTO lote_itens(lote_id,ordem,nome_entrada,arquivo_id,status_entrada,erro) "+
    "VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(lote_id,ordem) DO UPDATE "+
    "SET arquivo_id=EXCLUDED.arquivo_id,status_entrada=EXCLUDED.status_entrada,"+
    "erro=EXCLUDED.erro WHERE lote_itens.status_entrada='pendente'",
    [job.id,ordinal,name,result.id||null,result.status,result.error||""]);
  await db.query("UPDATE lotes_importacao SET atualizado_em=now() WHERE id=$1",[job.id]);
}
async function unpack(job){
  const path=filename(job.id);
  let index=0;
  try{
    const zip=await readFile(path);
    // Primeira passada usa apenas metadados: a interface vê TODAS as entradas
    // imediatamente; depois a leitura pesada avança em segundo plano.
    const manifest=await listZipDocuments(zip);
    await db.query(
      "INSERT INTO lote_itens(lote_id,ordem,nome_entrada,status_entrada,erro) "+
      "SELECT $1::uuid,x.ordem,x.nome,'pendente','' "+
      "FROM jsonb_to_recordset($2::jsonb) AS x(ordem integer,nome text) "+
      "ON CONFLICT(lote_id,ordem) DO NOTHING",
      [job.id,JSON.stringify(manifest)]);
    await db.query("UPDATE lotes_importacao SET atualizado_em=now() WHERE id=$1",[job.id]);
    const known=await db.query(
      "SELECT ordem FROM lote_itens WHERE lote_id=$1 AND status_entrada<>'pendente' "+
      "ORDER BY ordem",[job.id]);
    const processed=new Set(known.rows.map(r=>r.ordem));
    await eachZipDocument(zip,async(name,buffer)=>{
      const ordinal=++index;
      if(processed.has(ordinal))return;
      const result=await storeDocument(job,name,buffer);
      await record(job,ordinal,name,result);
    },async(name,reason)=>{
      const ordinal=++index;
      if(processed.has(ordinal))return;
      await record(job,ordinal,name,{status:"erro",error:reason});
    });
    await db.query("UPDATE lotes_importacao SET status='pronto',erro='',atualizado_em=now() "+
      "WHERE id=$1",[job.id]);
    await unlink(path).catch(e=>console.warn("Falha ao limpar ZIP processado",job.id,e));
    const summary=await db.query(
      "SELECT status_entrada,count(*)::int AS quantidade FROM lote_itens "+
      "WHERE lote_id=$1 GROUP BY status_entrada ORDER BY status_entrada",[job.id]);
    console.log("ZIP extraído",job.id,index,"entradas. Resultado:",
      JSON.stringify(Object.fromEntries(summary.rows.map(r=>[r.status_entrada,r.quantidade]))));
  }catch(error){
    const detail=String(error instanceof Error?error.message:error).slice(0,500);
    console.error("Erro ao descompactar ZIP",job.id,detail);
    // Não deixar itens pendentes indefinidamente após um erro fatal.
    await db.query(
      "UPDATE lote_itens SET status_entrada='erro',erro=$2 "+
      "WHERE lote_id=$1 AND status_entrada='pendente'",
      [job.id,"Extração interrompida: "+detail]).catch(console.error);
    await db.query("UPDATE lotes_importacao SET status='erro',erro=$2,atualizado_em=now() "+
      "WHERE id=$1",[job.id,detail]);
    // Preservar o ZIP original em falhas, para diagnóstico e reprocessamento.
  }
}
console.log("Livro Caixa: recepção assíncrona de ZIP iniciada");
for(;;){
  try{
    const job=await claim();
    if(job)await unpack(job);
    else await sleep(2500);
  }catch(error){
    console.error("Falha no recebedor de ZIP",error);
    await sleep(5000);
  }
}
