import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId, competence } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
import { confirmedCategoryId, suggestedCategory } from "@/lib/category-suggestions";
import { parsePaymentDate } from "@/lib/payment-date";

export const runtime="nodejs";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const id=safeId((await params).id);if(!id)return forbidden();
  const form=await request.formData();
  const batchRaw=String(form.get("arquivos")||"");
  const batch=/^\d+(?:,\d+){0,99}$/.test(batchRaw)?batchRaw:"";
  const suffix=batch?"&arquivos="+batch:"";
  const error=(cause:string)=>backTo("/conferencia?erro="+cause+suffix);
  const action=String(form.get("acao")||"salvar");

  const titular=safeId(form.get("titularId"));
  const categoryMode=String(form.get("categoriaId")||"");
  const proposed=categoryMode==="__new__";
  const suggestion=proposed?suggestedCategory(
    form.get("categoriaNovaNome"),form.get("categoriaNovaSubcategoria")):null;
  let categoria=!proposed&&categoryMode?safeId(categoryMode):null;
  const date=competence(form.get("competencia"));
  const paymentDate=parsePaymentDate(form.get("dataPagamento"));
  const titulo=String(form.get("titulo")||"").trim().slice(0,170);
  const tipo=String(form.get("tipo")||"outro");
  const documentoTipo=String(form.get("documentoTipo")||"outro").trim().slice(0,70);
  const contraparte=String(form.get("contraparte")||"").trim().slice(0,150);
  const descricao=String(form.get("descricao")||"").trim().slice(0,2000);
  const referencia=String(form.get("referencia")||"").trim().slice(0,100);
  const valorRaw=String(form.get("valor")||"").trim().replace(/\s/g,"");
  const numberString=valorRaw.includes(",")?valorRaw.replace(/\./g,"").replace(",","."):valorRaw;
  const valor=numberString===""?null:Number(numberString);
  const operationId=safeId(form.get("operacaoId"));

  if(!["salvar","aprovar"].includes(action)||!titular||!date||!titulo||paymentDate===undefined||
    (proposed&&!suggestion)||(categoryMode&&!proposed&&!categoria)||
    !["receita","despesa","outro"].includes(tipo)||
    (valor!==null&&(!Number.isFinite(valor)||valor<0||valor>1e14))||
    !await canAccessTitular(user,titular,"approve"))return error("dados");

  const db=getDatabase();
  const connection=await db.connect();
  try{
    await connection.query("BEGIN");
    const found=await connection.query<{
      id:string;titular_id:string;arquivo_id:string;duplicada_de:string|null;
      aprovado_em:string|null;status:string;
    }>(
      "SELECT p.id::text,p.titular_id::text,p.arquivo_id::text,p.duplicada_de::text,"+
      "p.aprovado_em::text,a.status FROM propostas p "+
      "JOIN arquivos a ON a.id=p.arquivo_id WHERE p.id=$1 FOR UPDATE OF p",[id],
    );
    const old=found.rows[0];
    if(!old||old.aprovado_em||old.duplicada_de||
       !await canAccessTitular(user,Number(old.titular_id),"approve")){
      await connection.query("ROLLBACK");return error("nao-autorizado");
    }
    if(categoria){
      const cat=await connection.query("SELECT 1 FROM categorias WHERE id=$1",[categoria]);
      if(!cat.rowCount){await connection.query("ROLLBACK");return error("categoria");}
    }
    // Salvar só armazena a proposta; a nova categoria nasce no banco APENAS
    // quando o documento é aprovado. Reutiliza equivalentes já cadastradas.
    if(action==="aprovar"&&suggestion)
      categoria=await confirmedCategoryId(connection,suggestion);
    if(operationId){
      const match=await connection.query(
        "SELECT 1 FROM operacoes WHERE id=$1 AND titular_id=$2 AND excluido_em IS NULL FOR UPDATE",
        [operationId,titular],
      );
      if(!match.rowCount){await connection.query("ROLLBACK");return error("vinculo");}
    }

    await connection.query(
      "UPDATE propostas SET titular_id=$2,titulo=$3,documento_tipo=$4,contraparte=$5,competencia=$6,"+
      "competencia_estimada=FALSE,categoria_id=$7,tipo=$8,descricao=$9,valor=$10,referencia=$11,"+
      "operacao_sugerida_id=$12,revisada_por=$13,revisada_em=now(),"+
      "categoria_sugerida_nome=$14,categoria_sugerida_subcategoria=$15,data_pagamento=$16 WHERE id=$1",
      [id,titular,titulo,documentoTipo,contraparte,date,categoria,tipo,descricao,valor,referencia,
        operationId,user.id,suggestion?.nome||"",suggestion?.subcategoria||"",paymentDate],
    );

    if(action==="aprovar"){
      if(old.status!=="pronto"){await connection.query("ROLLBACK");return error("ainda-processando");}
      let targetId=operationId;
      if(!targetId) {
        const created=await connection.query<{id:string}>(
          "INSERT INTO operacoes(titular_id,titulo,competencia,categoria_id,tipo,descricao,contraparte,valor,referencia,criado_por,data_pagamento) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text",
          [titular,titulo,date,categoria,tipo,descricao,contraparte,valor,referencia,user.id,paymentDate],
        );
        targetId=Number(created.rows[0].id);
      }
      // Ao vincular comprovante a uma operação antiga sem data, preencher a
      // efetivação comprovada; jamais sobrescrever uma data existente.
      if(paymentDate)await connection.query(
        "UPDATE operacoes SET data_pagamento=COALESCE(data_pagamento,$2) WHERE id=$1",
        [targetId,paymentDate]
      );
      await connection.query(
        "INSERT INTO operacao_arquivos(operacao_id,proposta_id,arquivo_id) VALUES($1,$2,$3)",
        [targetId,id,old.arquivo_id],
      );
      await connection.query(
        "UPDATE propostas SET aprovado_por=$2,aprovado_em=now(),operacao_id=$3 WHERE id=$1",
        [id,user.id,targetId],
      );
      await connection.query(
        "INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) VALUES($1,$2,$3,$4)",
        [targetId,user.id,"aprovação",JSON.stringify({proposta:id,arquivo:old.arquivo_id})],
      );
    }
    await connection.query("COMMIT");
    return backTo(action==="aprovar"?"/conferencia?aprovados=1"+suffix:
      "/conferencia?revisada="+id+suffix);
  }catch(e){
    await connection.query("ROLLBACK").catch(()=>{});
    console.error("Falha na revisão/aprovação da proposta",id,e);
    return error("processamento");
  }finally{connection.release();}
}
