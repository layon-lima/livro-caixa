import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import {
  StorageFullError, compressedOriginal, writeCompressedOriginal,
  localKey,
} from "@/lib/storage-actions";
import { sameOriginPost } from "@/lib/request-security";
import { MAX_ZIP_BYTES } from "@/lib/zip-documents";
import { saveIncomingZip } from "@/lib/zip-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE = 25 * 1024 * 1024;
const allowed: Record<string,string> = {
  pdf:"application/pdf", xml:"application/xml", png:"image/png",
  jpg:"image/jpeg", jpeg:"image/jpeg",
};

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({error:"Sessão expirada."},{status:401});
  if (!sameOriginPost(request)) return NextResponse.json({error:"Origem inválida."},{status:403});
  const form = await request.formData();
  // O titular da importação é APENAS um vínculo técnico temporário, nunca
  // a classificação final. O usuário não precisa selecioná-lo antes do OCR/IA.
  let titularId=safeId(form.get("titularId"));
  const automatico=!titularId;
  if(automatico){
    const choices=await getDatabase().query<{id:string}>(
      user.isAdmin?
        "SELECT id::text FROM titulares ORDER BY id LIMIT 1":
        "SELECT t.id::text FROM titulares t JOIN user_titular_permissions p "+
        "ON p.titular_id=t.id WHERE p.user_id=$1 AND p.can_import=TRUE "+
        "ORDER BY p.can_approve DESC,t.id LIMIT 1",
      user.isAdmin?[]:[user.id]
    );
    titularId=choices.rows[0]?Number(choices.rows[0].id):null;
  }
  if (!titularId || !await canAccessTitular(user,titularId,"import")) {
    return NextResponse.json({error:"Sem permissão de importação. Contate o administrador."},{status:403});
  }
  const entries = form.getAll("files");
  if (!entries.length || entries.length > 20) {
    return NextResponse.json({error:"Envie de 1 a 20 arquivos por lote."},{status:400});
  }

  const db = getDatabase();
  const results: {name:string;status:string;id?:string;error?:string;titular_nome?:string}[] = [];
  const importOne=async (entry:File):Promise<void> => {
    const name = entry.name.slice(0,255);
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (!allowed[ext] || entry.size===0 || entry.size>MAX_FILE) {
      results.push({name,status:"erro",error:"Arquivo inválido ou maior que 25 MB."}); return;
    }
    try {
      const buffer = Buffer.from(await entry.arrayBuffer());
      const mime = allowed[ext];
      const signature = buffer.subarray(0,8).toString("ascii");
      const valid = ext==="pdf" ? signature.startsWith("%PDF-")
        : ext==="png" ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : ext==="jpg" || ext==="jpeg" ? buffer[0]===255 && buffer[1]===216
        : buffer.subarray(0,2048).toString("utf8").includes("<");
      if (!valid) {
        results.push({name,status:"erro",error:"Conteúdo não corresponde ao tipo de arquivo."}); return;
      }
      const digest = createHash("sha256").update(buffer).digest("hex");
      const compressed = await compressedOriginal(buffer);
      const key = localKey(digest);
      const connection = await db.connect();
      try {
        await connection.query("BEGIN");
        // Impede que dois envios simultâneos ultrapassem a cota ou gravem duplicados.
        await connection.query("SELECT pg_advisory_xact_lock(731266201)");
        const existing = await connection.query<{
          id:string;titular_envio_id:string;status:string;armazenamento:string;descartado_em:string|null;
        }>(
          "SELECT id::text,titular_envio_id::text,status,armazenamento,descartado_em::text FROM arquivos WHERE sha256=$1 FOR UPDATE",[digest]
        );
        if (existing.rows[0]) {
          const original=existing.rows[0];
          // Reenvio explícito de documento previamente descartado:
          // usa o mesmo original, mas não mistura o novo processo com ZIP antigo.
          if(original.descartado_em&&original.titular_envio_id===String(titularId)&&
             original.armazenamento==="local"&&original.status!=="processando"){
            // Preservar histórico descartado; propostas novas serão criadas em nova leitura.
            await connection.query(
              "UPDATE lote_itens SET arquivo_id=NULL,status_entrada='descartado',"+
              "erro='Documento descartado e reenviado em nova importação' WHERE arquivo_id=$1",
              [original.id]);
            await connection.query(
              "UPDATE arquivos SET descartado_em=NULL,descartado_por=NULL,status='aguardando',"+
              "progresso_etapa='aguardando',progresso_dados='{}'::jsonb,"+
              "erro=NULL,texto_extraido='',atualizado_em=now() WHERE id=$1",
              [original.id]);
            await connection.query("COMMIT");
            results.push({name,status:"reprocessado",id:original.id});return;
          }
          // O usuário reenviou um documento ainda não conferido.
          // Reprocessar a mesma entrada sem duplicar armazenamento, preservando
          // documentos já revisados/aprovados e sem cruzar titulares distintos.
          if (original.titular_envio_id===String(titularId) &&
              original.armazenamento==="local" &&
              ["pronto","erro"].includes(original.status) && !original.descartado_em) {
            const checked=await connection.query(
              "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND "+
              "(revisada_em IS NOT NULL OR aprovado_em IS NOT NULL) AND descartado_em IS NULL LIMIT 1",[original.id]
            );
            if (!checked.rowCount) {
              await connection.query("DELETE FROM propostas WHERE arquivo_id=$1 AND descartado_em IS NULL",[original.id]);
              await connection.query(
                "UPDATE arquivos SET status='aguardando',progresso_etapa='aguardando',progresso_dados='{}'::jsonb,"+
                "erro=NULL,texto_extraido='',atualizado_em=now() "+
                "WHERE id=$1",[original.id]
              );
              await connection.query("COMMIT");
              results.push({name,status:"reprocessado",id:original.id});
              return;
            }
          }
          // Mesmo PDF já cadastrado em OUTRO livro: nunca abrir uma proposta
          // usando o titular errado nem revelar dados de livros não autorizados.
          // Se o usuário puder conferir o livro de origem, oferecer a conferência
          // existente sem duplicar o lançamento ou mudar a titularidade.
          if(original.titular_envio_id!==String(titularId)){
            const allowed=await canAccessTitular(user,Number(original.titular_envio_id),"approve");
            if(!allowed){
              await connection.query("COMMIT");
              results.push({name,status:"duplicado_restrito"});
              return;
            }
            const owner=await connection.query<{nome:string;ja_aprovado:boolean}>(
              "SELECT t.nome, EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=$1 "+
              "AND p.aprovado_em IS NOT NULL) AS ja_aprovado "+
              "FROM titulares t WHERE t.id=$2",
              [original.id,original.titular_envio_id]
            );
            await connection.query("COMMIT");
            const titular_nome=owner.rows[0]?.nome||"Outro titular";
            if(owner.rows[0]?.ja_aprovado){
              results.push({name,status:"aprovado_outro_titular",titular_nome});
            }else{
              results.push({name,status:"outro_titular",id:original.id,titular_nome});
            }
            return;
          }
          // Documento já aprovado: não reprocessar nem abrir conferência vazia.
          const belongs=original.titular_envio_id===String(titularId);
          const approved=belongs?await connection.query(
            "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND aprovado_em IS NOT NULL LIMIT 1",
            [original.id]
          ):null;
          await connection.query("COMMIT");
          results.push(approved?.rowCount?
            {name,status:"ja_aprovado"}:
            belongs?{name,status:"duplicado",id:original.id}:{name,status:"duplicado"});
          return;
        }
        await writeCompressedOriginal(key, compressed);
        const inserted = await connection.query<{id:string}>(
          "INSERT INTO arquivos (sha256,chave_armazenamento,nome_original,mime,bytes,"+
          "bytes_armazenados,armazenamento,compressao,titular_envio_id,enviado_por) "+
          "VALUES($1,$2,$3,$4,$5,$6,'local','gzip',$7,$8) RETURNING id::text",
          [digest,key,name,mime,buffer.length,compressed.length,titularId,user.id],
        );
        await connection.query("COMMIT");
        results.push({name,status:"importado",id:inserted.rows[0].id});
      } catch (error) {
        await connection.query("ROLLBACK").catch(()=>{});
        throw error;
      } finally { connection.release(); }
    } catch (error) {
      if (error instanceof StorageFullError) {
        results.push({name,status:"erro",error:error.message});
      } else {
        console.error("Erro ao importar",name,error);
        results.push({name,status:"erro",error:"Falha ao armazenar o documento na VPS."});
      }
    }
  };
  // O ZIP é um lote: descompactar e enfileirar na ordem do arquivo.
  // O worker OCR já é sequencial e independente da requisição HTTP.
  const zipped=entries.length===1&&entries[0] instanceof File&&
    entries[0].name.toLowerCase().endsWith(".zip");
  if(zipped) {
    // O upload confirma o recebimento do ZIP; um worker próprio o descompacta
    // depois, sem manter a conexão HTTP aberta por centenas de arquivos.
    const archive=entries[0] as File;
    if(archive.size===0||archive.size>MAX_ZIP_BYTES)
      return NextResponse.json({error:"ZIP inválido ou maior que 80 MB."},{status:413});
    const signature=Buffer.from(await archive.slice(0,4).arrayBuffer());
    if(!signature.equals(Buffer.from([0x50,0x4b,0x03,0x04])))
      return NextResponse.json({error:"O arquivo não contém um ZIP válido."},{status:400});
    const lot=await db.query<{id:string}>(
      "INSERT INTO lotes_importacao(enviado_por,nome_arquivo,status,titular_envio_id) "+
      "VALUES($1,$2,'recebendo',$3) RETURNING id::text",
      [user.id,archive.name.slice(0,255),titularId]
    );
    const lote=lot.rows[0].id;
    try{
      await saveIncomingZip(lote,Buffer.from(await archive.arrayBuffer()));
      await db.query("UPDATE lotes_importacao SET zip_pronto=TRUE,atualizado_em=now() WHERE id=$1",[lote]);
    }catch(error){
      console.error("Falha ao receber ZIP",lote,error);
      await db.query("UPDATE lotes_importacao SET status='erro',erro=$2,atualizado_em=now() "+
        "WHERE id=$1",[lote,"Falha ao guardar o ZIP recebido."]);
      return NextResponse.json(
        {error:"Não foi possível guardar o ZIP na VPS. Confira o espaço livre e tente novamente."},
        {status:507,headers:{"Cache-Control":"no-store"}}
      );
    }
    // Ao reabrir a conferência, o lote é retomado pela base PostgreSQL.
    return NextResponse.json({lote,results:[],recebido:true},
      {headers:{"Cache-Control":"private, no-store"}});
  }
  if(entries.some(e=>e instanceof File&&e.name.toLowerCase().endsWith(".zip")))
    return NextResponse.json({error:"Envie um ZIP por vez, sem misturá-lo com outros arquivos."},{status:400});
  for(const entry of entries)if(entry instanceof File)await importOne(entry);
  return NextResponse.json({results},{headers:{"Cache-Control":"private, no-store"}});
}
