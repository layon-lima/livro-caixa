import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId, competence } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
import { parsePaymentDate } from "@/lib/payment-date";
import {checkDuplicate} from "@/lib/duplicate-guard";
import {strongDuplicateKey} from "@/lib/duplicate-identity";
import {parseTagIds,validateTags,writeTags,copyProposalTags} from "@/lib/tags";
export const runtime="nodejs";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const id=safeId((await params).id);if(!id)return forbidden();
  const db=getDatabase();
  const op=await db.query<{titular_id:string;excluido_em:string|null}>(
    "SELECT titular_id::text,excluido_em::text FROM operacoes WHERE id=$1",[id]);
  if(!op.rows[0])return forbidden();
  const oldTitular=Number(op.rows[0].titular_id);
  const f=await request.formData();
  const tagIds=parseTagIds(f);
  const action=String(f.get("acao")||"editar");
  if(action==="excluir"||action==="restaurar"){
    if(!await canAccessTitular(user,oldTitular,"delete"))return forbidden();
    const cx=await db.connect();
    try{
      await cx.query("BEGIN");
      const saved=await cx.query<{
        id:string;titular_id:string;referencia:string;documento_tipo:string|null;
        data_pagamento:string|null;valor:string|null;contraparte:string;tipo:string;excluido_em:string|null;
      }>(
        "SELECT o.id::text,o.titular_id::text,o.referencia,o.data_pagamento::text,o.valor::text,"+
        "o.contraparte,o.tipo,o.excluido_em::text,("+
        "SELECT p.documento_tipo FROM propostas p WHERE p.operacao_id=o.id "+
        "AND p.aprovado_em IS NOT NULL ORDER BY p.id LIMIT 1) AS documento_tipo "+
        "FROM operacoes o WHERE o.id=$1 FOR UPDATE OF o",[id]);
      const item=saved.rows[0];
      if(!item){await cx.query("ROLLBACK");return forbidden();}
      if(action==="restaurar"){
        const duplicate=await checkDuplicate(cx,{
          titularId:Number(item.titular_id),documentType:item.documento_tipo||"manual",
          reference:item.referencia,paymentDate:item.data_pagamento,amount:item.valor,
          counterparty:item.contraparte,type:item.tipo,excludeOperationId:id
        });
        if(duplicate?.level==="strong" ||
           (duplicate?.level==="similar"&&String(f.get("confirmarSemelhante")||"")!=="1")){
          await cx.query("ROLLBACK");
          return backTo("/lixeira?erro="+(duplicate.level==="strong"?"duplicado":"semelhante")+"&id="+id);
        }
      }
      await cx.query(action==="excluir"?
        "UPDATE operacoes SET excluido_em=now(),alterado_por=$2,atualizado_em=now() WHERE id=$1":
        "UPDATE operacoes SET excluido_em=NULL,alterado_por=$2,atualizado_em=now() WHERE id=$1",
        [id,user.id]);
      await cx.query("INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) "+
        "VALUES($1,$2,$3,$4::jsonb)",
        [id,user.id,action,JSON.stringify({
          confirmacao_semelhante:action==="restaurar"&&String(f.get("confirmarSemelhante")||"")==="1"
        })]);
      await cx.query("COMMIT");
      return backTo("/livros/"+oldTitular);
    }catch(e){
      await cx.query("ROLLBACK").catch(()=>{});
      if((e as {code?:string})?.code==="23505")return backTo("/lixeira?erro=duplicado");
      console.error("Erro ao restaurar/excluir lançamento",e);
      return backTo("/lixeira?erro=processamento");
    }finally{cx.release();}
  }
  if(!await canAccessTitular(user,oldTitular,"edit"))return forbidden();
  const titular=safeId(f.get("titularId")),cat=safeId(f.get("categoriaId"));
  const title=String(f.get("titulo")||"").trim().slice(0,170);
  const date=competence(f.get("competencia"));
  const dataPagamento=parsePaymentDate(f.get("dataPagamento"));
  const tipo=String(f.get("tipo")||"outro");
  const description=String(f.get("descricao")||"").trim().slice(0,2000);
  const contraparte=String(f.get("contraparte")||"").trim().slice(0,150);
  const referencia=String(f.get("referencia")||"").trim().slice(0,100);
  const moneyRaw=String(f.get("valor")||"").trim().replace(",",".");
  const money=moneyRaw===""?null:Number(moneyRaw);
  // Troca de titular só pela rota dedicada /mover: evita quebrar vínculos de PDFs.
  if(tagIds===null||!titular||titular!==oldTitular||!title||!date||dataPagamento===undefined||!["despesa","outro"].includes(tipo)||
     (money!==null&&(!Number.isFinite(money)||money<0))||
     !await canAccessTitular(user,titular,"edit"))return forbidden();
  if(cat){
    const match=await db.query(
      "SELECT 1 FROM categorias WHERE id=$1 AND (ativa=TRUE OR id=(SELECT categoria_id FROM operacoes WHERE id=$2))",
      [cat,id]);
    if(!match.rowCount)return forbidden();
  }
  const conn=await db.connect();
  try{
    await conn.query("BEGIN");
    if(!await validateTags(conn,tagIds)){await conn.query("ROLLBACK");return forbidden();}
    const current=await conn.query<{tipo:string;referencia:string;documento_tipo:string|null}>(
      "SELECT o.tipo,o.referencia,("+
      "SELECT p.documento_tipo FROM propostas p WHERE p.operacao_id=o.id AND p.aprovado_em IS NOT NULL "+
      "ORDER BY p.id LIMIT 1) AS documento_tipo FROM operacoes o WHERE o.id=$1 FOR UPDATE OF o",[id]);
    if(!current.rows[0]){await conn.query("ROLLBACK");return forbidden();}
    // Ao editar também é proibido transformar um lançamento em outra transação já existente.
    const documentType=current.rows[0].documento_tipo||"manual";
    const duplicate=await checkDuplicate(conn,{
      titularId:titular,documentType,
      reference:referencia,paymentDate:dataPagamento,amount:money,
      counterparty:contraparte,type:tipo,excludeOperationId:id
    });
    if(duplicate){
      if(duplicate.level==="strong"||String(f.get("confirmarSemelhante")||"")!=="1"){
        await conn.query("ROLLBACK");
        return backTo("/operacoes/"+id+"?erro="+(duplicate.level==="strong"?"duplicado":"semelhante"));
      }
    }
    await conn.query(
      "UPDATE operacoes SET titular_id=$2,titulo=$3,competencia=$4,categoria_id=$5,tipo=$6,descricao=$7,"+
      "contraparte=$8,referencia=$9,valor=$10,alterado_por=$11,data_pagamento=$12,chave_duplicidade=$13,atualizado_em=now() WHERE id=$1",
      [id,titular,title,date,cat,tipo,description,contraparte,referencia,money,user.id,dataPagamento,
        strongDuplicateKey(documentType,referencia)],
    );
    await writeTags(conn,"operacao",id,tagIds);
    await conn.query("UPDATE propostas SET titular_id=$2 WHERE operacao_id=$1",[id,titular]);
    await conn.query("INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) "+
      "VALUES($1,$2,'edição',$3::jsonb)",
      [id,user.id,JSON.stringify({
        confirmacao_semelhante:duplicate?.level==="similar"&&String(f.get("confirmarSemelhante")||"")==="1"
      })]);
    await conn.query("COMMIT");
  }catch(e){
    await conn.query("ROLLBACK").catch(()=>{});
    if((e as {code?:string})?.code==="23505")return backTo("/operacoes/"+id+"?erro=duplicado");
    throw e;
  }finally{conn.release();}
  return backTo("/livros/"+titular+"?op="+id);
}
