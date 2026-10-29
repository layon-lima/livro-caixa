import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
export const runtime="nodejs";
export const dynamic="force-dynamic";

// Fonte da verdade no PostgreSQL, não no estado do navegador.
// Isso permite sair da conferência ou recarregar sem perder a análise.
export async function GET(){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Não autenticado."},{status:401});
  const access=(alias:string)=>user.isAdmin?"TRUE":
    "EXISTS (SELECT 1 FROM user_titular_permissions up WHERE up.user_id=$1 "+
    "AND up.titular_id="+alias+" AND up.can_approve=TRUE)";
  const query=
    "SELECT * FROM ("+
    "SELECT a.id::text AS arquivo_id,NULL::text AS proposta_id,a.nome_original,a.status "+
    "FROM arquivos a WHERE a.status IN ('aguardando','processando','erro') "+
    "AND NOT EXISTS (SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NULL) "+
    "AND "+access("a.titular_envio_id")+
    " UNION ALL "+
    "SELECT a.id::text AS arquivo_id,p.id::text AS proposta_id,a.nome_original,a.status "+
    "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id "+
    "WHERE p.aprovado_em IS NULL AND "+access("p.titular_id")+
    ") x ORDER BY arquivo_id::bigint DESC LIMIT 50";
  const result=await getDatabase().query<{
    arquivo_id:string;proposta_id:string|null;nome_original:string;status:string;
  }>(query,user.isAdmin?[]:[user.id]);
  const first=result.rows[0];
  const href=first?(first.proposta_id?
    "/conferencia?id="+encodeURIComponent(first.proposta_id):
    "/conferencia?arquivo="+encodeURIComponent(first.arquivo_id)):"";
  return NextResponse.json({count:result.rows.length,href},
    {headers:{"Cache-Control":"private, no-store"}});
}