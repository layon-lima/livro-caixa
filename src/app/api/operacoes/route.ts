import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { competence, safeId } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
import { parsePaymentDate } from "@/lib/payment-date";
import {checkDuplicate} from "@/lib/duplicate-guard";
import {strongDuplicateKey} from "@/lib/duplicate-identity";
import {parseTagIds,validateTags,writeTags,copyProposalTags} from "@/lib/tags";
export const runtime="nodejs";

export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const json=request.headers.get("accept")?.includes("application/json");
  const f=await request.formData();
  const tagIds=parseTagIds(f);
  const titular=safeId(f.get("titularId")),categoria=safeId(f.get("categoriaId"));
  const titulo=String(f.get("titulo")||"").trim().slice(0,170);
  const competencia=competence(f.get("competencia"));
  const dataPagamento=parsePaymentDate(f.get("dataPagamento"));
  const tipo=String(f.get("tipo")||"outro");
  const contraparte=String(f.get("contraparte")||"").trim().slice(0,150);
  const descricao=String(f.get("descricao")||"").trim().slice(0,2000);
  const referencia=String(f.get("referencia")||"").trim().slice(0,100);
  const valorRaw=String(f.get("valor")||"").trim().replace(/\s/g,"");
  const valorNumber=valorRaw.includes(",")?valorRaw.replace(/\./g,"").replace(",","."):valorRaw;
  const valor=valorNumber?Number(valorNumber):null;
  const confirmSimilar=String(f.get("confirmarSemelhante")||"")==="1";
  if(tagIds===null||!titular||!titulo||!competencia||dataPagamento===undefined||
     !["despesa","outro"].includes(tipo)||
     (valor!==null&&(!Number.isFinite(valor)||valor<0||valor>1e14))||
     !await canAccessTitular(user,titular,"edit"))return forbidden();
  const db=getDatabase();
  if(categoria){
    const active=await db.query("SELECT 1 FROM categorias WHERE id=$1 AND ativa=TRUE",[categoria]);
    if(!active.rowCount)return forbidden();
  }
  const cx=await db.connect();
  try{
    await cx.query("BEGIN");
    if(!await validateTags(cx,tagIds)){await cx.query("ROLLBACK");return forbidden();}
    const duplicate=await checkDuplicate(cx,{
      titularId:titular,documentType:"manual",reference:referencia,
      paymentDate:dataPagamento,amount:valor,counterparty:contraparte,type:tipo
    });
    if(duplicate && (duplicate.level==="strong"||!confirmSimilar)){
      await cx.query("ROLLBACK");
      if(json)return Response.json({
        duplicate:duplicate.level,
        message:duplicate.level==="strong"?
          "Esta transação já foi lançada. O mesmo identificador não pode ser registrado duas vezes.":
          "Já existe um lançamento com o mesmo titular, recebedor, valor e data. Confira antes de continuar.",
        existing:duplicate.titularId===String(titular)?duplicate.operationId:null
      },{status:409,headers:{"Cache-Control":"no-store"}});
      return backTo("/manual?titular="+titular+"&erro="+
        (duplicate.level==="strong"?"duplicado":"semelhante"));
    }
    const r=await cx.query<{id:string}>(
      "INSERT INTO operacoes(titular_id,titulo,competencia,categoria_id,tipo,contraparte,"+
      "descricao,valor,referencia,criado_por,manual,data_pagamento,chave_duplicidade) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12) RETURNING id::text",
      [titular,titulo,competencia,categoria,tipo,contraparte,descricao,valor,referencia,user.id,dataPagamento,
        strongDuplicateKey("manual",referencia)]
    );
    await writeTags(cx,"operacao",Number(r.rows[0].id),tagIds);
    if(duplicate?.level==="similar"&&confirmSimilar)await cx.query(
      "INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) "+
      "VALUES($1,$2,'confirmação de possível duplicidade',$3::jsonb)",
      [r.rows[0].id,user.id,JSON.stringify({comparado_com:duplicate.operationId,confirmado:true})]);
    await cx.query("COMMIT");
    const href="/livros/"+titular+"?op="+r.rows[0].id;
    return json?Response.json({href},{headers:{"Cache-Control":"no-store"}}):backTo(href);
  }catch(e){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Erro no lançamento manual",e);
    const duplicate=(e as {code?:string})?.code==="23505";
    if(json)return Response.json({duplicate:duplicate?"strong":null,
      message:duplicate?"Identificador já registrado.":"Não foi possível salvar o lançamento."},
      {status:duplicate?409:500,headers:{"Cache-Control":"no-store"}});
    return backTo("/manual?titular="+titular+"&erro="+(duplicate?"duplicado":"salvar"));
  }finally{cx.release();}
}
