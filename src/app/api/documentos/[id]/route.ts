import { NextResponse } from "next/server";
import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { readOriginal } from "@/lib/storage-actions";
import { suggestDocumentName } from "@/lib/document-name";
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
    propostas_quantidade:number;documento_tipo:string|null;titulo:string|null;
    contraparte:string|null;descricao:string|null;data_pagamento:string|null;
    categoria:string|null;subcategoria:string|null;
  }>(
    "SELECT a.chave_armazenamento,a.armazenamento,a.nome_original,a.mime,a.titular_envio_id::text, "+
    "ARRAY(SELECT DISTINCT p.titular_id::text FROM propostas p WHERE p.arquivo_id=a.id) AS acessos,"+
    "(SELECT count(*)::int FROM propostas p WHERE p.arquivo_id=a.id AND p.descartado_em IS NULL) AS propostas_quantidade,"+
    "d.documento_tipo,d.titulo,d.contraparte,d.descricao,d.data_pagamento::text,d.categoria,d.subcategoria "+
    "FROM arquivos a "+
    "LEFT JOIN LATERAL (SELECT p.documento_tipo,"+
    "COALESCE(NULLIF(o.titulo,''),p.titulo) AS titulo,"+
    "COALESCE(NULLIF(o.contraparte,''),p.contraparte) AS contraparte,"+
    "COALESCE(NULLIF(o.descricao,''),p.descricao) AS descricao,"+
    "COALESCE(o.data_pagamento,p.data_pagamento) AS data_pagamento,"+
    "c.nome AS categoria,c.subcategoria FROM propostas p "+
    "LEFT JOIN operacoes o ON o.id=p.operacao_id LEFT JOIN categorias c ON c.id=COALESCE(o.categoria_id,p.categoria_id) "+
    "WHERE p.arquivo_id=a.id AND p.descartado_em IS NULL "+
    "ORDER BY (p.aprovado_em IS NOT NULL) DESC,p.id LIMIT 1) d ON TRUE "+
    "WHERE a.id=$1",[fileId],
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
    // Ao abrir/salvar, usar o nome identificado. O conteúdo original é imutável.
    // PDFs com mais de uma proposta continuam com o nome de origem.
    const displayName=file.propostas_quantidade===1?suggestDocumentName({
      originalName:file.nome_original,documentType:file.documento_tipo,
      title:file.titulo,counterparty:file.contraparte,category:file.categoria,
      subcategory:file.subcategoria,description:file.descricao,
      paymentDate:file.data_pagamento
    }):file.nome_original;
    const safeName=displayName.replace(/[\\/\r\n"]/g,"_");
    // RFC 5987: preservar acentos em nomes usados pelo navegador.
    const asciiName=safeName.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^\x20-\x7e]/g,"_").replace(/["\\;]/g,"_");
    const encodedName=encodeURIComponent(safeName).replace(/['()*]/g,
      c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
    const body=new Uint8Array(data.length);
    body.set(data);
    return new NextResponse(body.buffer,{
      headers:{
        "Content-Type":file.mime,
        "Content-Disposition":'inline; filename="'+asciiName+'"; filename*=UTF-8\'\''+encodedName,
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
