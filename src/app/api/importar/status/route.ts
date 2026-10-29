import { NextResponse } from "next/server";
import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = {
  id: string;
  titular_id: string;
  status: "aguardando"|"processando"|"pronto"|"erro";
  erro: string|null;
  propostas: number;
  proposta_id: string|null;
  nome_original: string;
  progresso_etapa: string;
  progresso_dados: Record<string,string>;
};

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({error:"Sessão expirada."},{status:401});
  const raw = new URL(request.url).searchParams.get("ids") || "";
  if (!/^\d+(?:,\d+){0,99}$/.test(raw)) {
    return NextResponse.json({error:"Lista de arquivos inválida."},{status:400});
  }
  const ids=[...new Set(raw.split(",").map(Number))];
  if (ids.some(id=>!Number.isSafeInteger(id)||id<=0)) {
    return NextResponse.json({error:"Identificadores inválidos."},{status:400});
  }
  const rows=await getDatabase().query<Item>(
    "SELECT a.id::text,a.titular_envio_id::text AS titular_id,a.nome_original,a.status,a.erro,"+
    "a.progresso_etapa,a.progresso_dados,"+
    "(SELECT count(*)::integer FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NULL) AS propostas,"+
    "(SELECT p.id::text FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NULL ORDER BY p.id LIMIT 1) AS proposta_id "+
    "FROM arquivos a WHERE a.id=ANY($1::bigint[])",
    [ids],
  );
  if (rows.rows.length!==ids.length) return NextResponse.json({error:"Arquivo não encontrado."},{status:404});
  for (const item of rows.rows) {
    if (!await canAccessTitular(user,Number(item.titular_id),"import")) {
      return NextResponse.json({error:"Sem permissão de acompanhar este arquivo."},{status:403});
    }
  }
  return NextResponse.json({arquivos:rows.rows},{headers:{"Cache-Control":"no-store"}});
}
