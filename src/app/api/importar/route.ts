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
  const titularId = safeId(form.get("titularId"));
  if (!titularId || !await canAccessTitular(user,titularId,"import")) {
    return NextResponse.json({error:"Sem permissão de importação para este titular."},{status:403});
  }
  const entries = form.getAll("files");
  if (!entries.length || entries.length > 20) {
    return NextResponse.json({error:"Envie de 1 a 20 arquivos por lote."},{status:400});
  }

  const db = getDatabase();
  const results: {name:string;status:string;id?:string;error?:string}[] = [];
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    const name = entry.name.slice(0,255);
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (!allowed[ext] || entry.size===0 || entry.size>MAX_FILE) {
      results.push({name,status:"erro",error:"Arquivo inválido ou maior que 25 MB."}); continue;
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
        results.push({name,status:"erro",error:"Conteúdo não corresponde ao tipo de arquivo."}); continue;
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
          id:string;titular_envio_id:string;status:string;armazenamento:string;
        }>(
          "SELECT id::text,titular_envio_id::text,status,armazenamento FROM arquivos WHERE sha256=$1 FOR UPDATE",[digest]
        );
        if (existing.rows[0]) {
          const original=existing.rows[0];
          // O usuário reenviou um documento ainda não conferido.
          // Reprocessar a mesma entrada sem duplicar armazenamento, preservando
          // documentos já revisados/aprovados e sem cruzar titulares distintos.
          if (original.titular_envio_id===String(titularId) &&
              original.armazenamento==="local" &&
              ["pronto","erro"].includes(original.status)) {
            const checked=await connection.query(
              "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND "+
              "(revisada_em IS NOT NULL OR aprovado_em IS NOT NULL) LIMIT 1",[original.id]
            );
            if (!checked.rowCount) {
              await connection.query("DELETE FROM propostas WHERE arquivo_id=$1",[original.id]);
              await connection.query(
                "UPDATE arquivos SET status='aguardando',erro=NULL,texto_extraido='',atualizado_em=now() "+
                "WHERE id=$1",[original.id]
              );
              await connection.query("COMMIT");
              results.push({name,status:"reprocessado",id:original.id});
              continue;
            }
          }
          await connection.query("COMMIT");
          results.push(original.titular_envio_id===String(titularId)
            ? {name,status:"duplicado",id:original.id}
            : {name,status:"duplicado"});
          continue;
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
  }
  return NextResponse.json({results},{headers:{"Cache-Control":"no-store"}});
}
