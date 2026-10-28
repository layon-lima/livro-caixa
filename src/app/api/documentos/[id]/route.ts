import { NextResponse } from "next/server";
import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { readOriginal } from "@/lib/storage-actions";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();
  if (!user) return new Response("Não autenticado",{status:401});
  const fileId=safeId((await params).id);
  if (!fileId) return new Response("Arquivo não encontrado",{status:404});
  const r=await getDatabase().query<{
    chave_armazenamento:string;armazenamento:string;nome_original:string;
    mime:string;titular_envio_id:string;acessos:string[];
  }>(
    "SELECT a.chave_armazenamento,a.armazenamento,a.nome_original,a.mime,a.titular_envio_id::text, "+
    "ARRAY(SELECT DISTINCT p.titular_id::text FROM propostas p WHERE p.arquivo_id=a.id) AS acessos "+
    "FROM arquivos a WHERE a.id=$1",[fileId],
  );
  const file=r.rows[0];
  if (!file) return new Response("Arquivo não encontrado",{status:404});
  const ids=new Set([file.titular_envio_id,...file.acessos].map(Number));
  // PDF com documentos de titulares diferentes só pode ser aberto integralmente pelo admin.
  if (!user.isAdmin && (ids.size!==1 || !await canAccessTitular(user,Number(file.titular_envio_id),"view"))) {
    return new Response("Acesso negado",{status:403});
  }
  if(file.armazenamento!=="local") {
    return new Response("Arquivo antigo pendente de migração de armazenamento.",{status:503});
  }
  try {
    const data=await readOriginal(file.chave_armazenamento,file.armazenamento);
    const safeName=file.nome_original.replace(/[\r\n"]/g,"_");
    const body=new Uint8Array(data.length);
    body.set(data);
    return new NextResponse(body.buffer,{
      headers:{
        "Content-Type":file.mime,
        "Content-Disposition":'inline; filename="'+safeName+'"',
        "Cache-Control":"private, no-store",
        "X-Content-Type-Options":"nosniff",
        "Content-Security-Policy":"sandbox",
      },
    });
  }catch(error){
    console.error("Erro ao abrir arquivo",fileId,error);
    return new Response("Arquivo indisponível",{status:502});
  }
}
