import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { r2Ready, storeOriginal } from "@/lib/storage-actions";
import { sameOriginPost } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE = 25 * 1024 * 1024;
const allowed: Record<string,string> = {
  pdf:"application/pdf", xml:"application/xml", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg",
};
export async function POST(request: Request) {
  const user=await currentUser();
  if (!user) return NextResponse.json({error:"Sessão expirada."},{status:401});
  if (!sameOriginPost(request)) return NextResponse.json({error:"Origem inválida."},{status:403});
  if (!r2Ready()) return NextResponse.json({error:"Cloudflare R2 ainda não configurado na VPS."},{status:503});
  const form=await request.formData();
  const titularId=safeId(form.get("titularId"));
  if (!titularId || !await canAccessTitular(user,titularId,"import")) {
    return NextResponse.json({error:"Sem permissão de importação para este titular."},{status:403});
  }
  const entries=form.getAll("files");
  if (!entries.length || entries.length > 20) return NextResponse.json({error:"Envie de 1 a 20 arquivos por lote."},{status:400});
  const db=getDatabase();
  const results: {name:string;status:string;id?:string;error?:string}[]=[];
  for(const entry of entries) {
    if (!(entry instanceof File)) continue;
    const name=entry.name.slice(0,255);
    const ext=name.split(".").pop()?.toLowerCase() || "";
    if (!allowed[ext] || entry.size===0 || entry.size>MAX_FILE) {
      results.push({name,status:"erro",error:"Arquivo inválido ou maior que 25 MB."}); continue;
    }
    try {
      const buffer=Buffer.from(await entry.arrayBuffer());
      const mime=allowed[ext];
      // Assinatura básica para impedir upload de tipos inesperados.
      const signature=buffer.subarray(0,8).toString("ascii");
      const valid=ext==="pdf" ? signature.startsWith("%PDF-")
        : ext==="png" ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : ext==="jpg" || ext==="jpeg" ? buffer[0]===255 && buffer[1]===216
        : buffer.subarray(0,2048).toString("utf8").includes("<");
      if (!valid) { results.push({name,status:"erro",error:"Conteúdo não corresponde ao tipo de arquivo."}); continue; }
      const digest=createHash("sha256").update(buffer).digest("hex");
      const existing=await db.query<{id:string}>("SELECT id::text AS id FROM arquivos WHERE sha256=$1",[digest]);
      if (existing.rows[0]) { results.push({name,status:"duplicado",id:existing.rows[0].id}); continue; }
      const key="originais/"+digest.slice(0,2)+"/"+randomUUID()+"."+ext;
      await storeOriginal(key,buffer,mime);
      const inserted=await db.query<{id:string}>(
        "INSERT INTO arquivos(sha256,chave_r2,nome_original,mime,bytes,titular_envio_id,enviado_por) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sha256) DO NOTHING RETURNING id::text AS id",
        [digest,key,name,mime,buffer.length,titularId,user.id],
      );
      results.push(inserted.rows[0] ? {name,status:"importado",id:inserted.rows[0].id} : {name,status:"duplicado"});
    } catch(error) {
      console.error("Erro ao importar",name,error);
      results.push({name,status:"erro",error:"Falha ao armazenar documento."});
    }
  }
  return NextResponse.json({results},{headers:{"Cache-Control":"no-store"}});
}
