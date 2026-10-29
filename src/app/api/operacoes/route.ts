import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { competence, safeId } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
import { parsePaymentDate } from "@/lib/payment-date";
export const runtime="nodejs";
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const f=await request.formData();
  const titular=safeId(f.get("titularId")),categoria=safeId(f.get("categoriaId"));
  const titulo=String(f.get("titulo")||"").trim().slice(0,170);
  const competencia=competence(f.get("competencia"));
  const dataPagamento=parsePaymentDate(f.get("dataPagamento"));
  const tipo=String(f.get("tipo")||"outro");
  const contraparte=String(f.get("contraparte")||"").trim().slice(0,150);
  const descricao=String(f.get("descricao")||"").trim().slice(0,2000);
  const valorRaw=String(f.get("valor")||"").trim().replace(",",".");
  const valor=valorRaw?Number(valorRaw):null;
  if(!titular||!titulo||!competencia||dataPagamento===undefined||!["despesa","outro"].includes(tipo)||
     (valor!==null&&(!Number.isFinite(valor)||valor<0))||
     !await canAccessTitular(user,titular,"edit"))return forbidden();
  const r=await getDatabase().query<{id:string}>(
    "INSERT INTO operacoes(titular_id,titulo,competencia,categoria_id,tipo,contraparte,descricao,valor,criado_por,manual,data_pagamento) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10) RETURNING id::text",
    [titular,titulo,competencia,categoria,tipo,contraparte,descricao,valor,user.id,dataPagamento],
  );
  return backTo("/livros/"+titular+"?op="+r.rows[0].id);
}
