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
  // Uma única fonte de verdade para o botão global: somente documentos
  // que ainda precisam de conferência. Aprovados/descartados/duplicados
  // não entram na contagem. COUNT OVER evita o antigo limite de 50.
  const query=
    "WITH elegiveis AS ("+
    "SELECT a.id::text AS arquivo_id,NULL::text AS proposta_id "+
    "FROM arquivos a JOIN titulares t ON t.id=a.titular_envio_id "+
    "WHERE a.descartado_em IS NULL "+
    "AND a.status IN ('aguardando','processando') "+
    "AND NOT EXISTS (SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id "+
    "AND p.aprovado_em IS NULL) "+
    "AND NOT EXISTS (SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NOT NULL) "+
    "AND "+access("a.titular_envio_id")+
    " UNION ALL "+
    "SELECT a.id::text AS arquivo_id,p.id::text AS proposta_id "+
    "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id "+
    "JOIN titulares t ON t.id=p.titular_id "+
    "WHERE p.aprovado_em IS NULL AND p.descartado_em IS NULL "+
    "AND p.duplicada_de IS NULL AND a.descartado_em IS NULL "+
    "AND a.status='pronto' "+
    "AND "+access("p.titular_id")+
    ") SELECT arquivo_id,proposta_id,COUNT(*) OVER()::int AS total "+
    "FROM elegiveis ORDER BY arquivo_id::bigint DESC LIMIT 1";
  const result=await getDatabase().query<{
    arquivo_id:string;proposta_id:string|null;total:number;
  }>(query,user.isAdmin?[]:[user.id]);
  const first=result.rows[0];
  // O contador abrange TODOS os documentos pendentes, portanto o destino
  // deve ser a fila geral, não um ZIP antigo que pode já estar concluído.
  // Apontamos diretamente para um registro ainda pendente dessa mesma consulta.
  const href=first?(first.proposta_id?
    "/conferencia?id="+encodeURIComponent(first.proposta_id):
    "/conferencia?arquivo="+encodeURIComponent(first.arquivo_id)):"";
  return NextResponse.json({count:first?.total||0,href},
    {headers:{"Cache-Control":"private, no-store"}});
}