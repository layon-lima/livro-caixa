import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { rememberApprovedClassification } from "@/lib/classification-learning";
import { safeId } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
import { confirmedCategoryId, suggestedCategory } from "@/lib/category-suggestions";
import {checkDuplicate} from "@/lib/duplicate-guard";
import {strongDuplicateKey} from "@/lib/duplicate-identity";
export const runtime="nodejs";

export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const form=await request.formData();
  const batchRaw=String(form.get("arquivos")||"");
  const lote=String(form.get("lote")||"");
  const batch=/^\d+(?:,\d+){0,99}$/.test(batchRaw)?"&arquivos="+batchRaw:
    /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(lote)?
      "&lote="+encodeURIComponent(lote):"";
  const ids=[...new Set(form.getAll("ids").map(safeId).filter((n):n is number=>n!==null))];
  if(!ids.length||ids.length>100)return backTo("/conferencia?erro=selecione");
  const db=getDatabase();
  const cx=await db.connect();
  try{
    await cx.query("BEGIN");
    const found=await cx.query<{
      id:string;arquivo_id:string;titular_id:string;titulo:string;documento_tipo:string;
      competencia:string;data_pagamento:string|null;categoria_id:string|null;tipo:string;descricao:string;contraparte:string;
      valor:string|null;referencia:string;operacao_sugerida_id:string|null;revisada_em:string|null;
      aprovado_em:string|null;status:string;duplicada_de:string|null;
      categoria_sugerida_nome:string;categoria_sugerida_subcategoria:string;
    }>(
      "SELECT p.id::text,p.arquivo_id::text,p.titular_id::text,p.titulo,p.documento_tipo,p.competencia::text,p.data_pagamento::text,"+
      "p.categoria_id::text,p.tipo,p.descricao,p.contraparte,p.valor::text,p.referencia,p.operacao_sugerida_id::text,"+
      "p.revisada_em::text,p.aprovado_em::text,p.duplicada_de::text,"+
      "p.categoria_sugerida_nome,p.categoria_sugerida_subcategoria,a.status "+
      "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id "+
      "WHERE p.id=ANY($1::bigint[]) AND p.descartado_em IS NULL AND a.descartado_em IS NULL FOR UPDATE OF p,a",
      [ids],
    );
    if(found.rows.length!==ids.length){await cx.query("ROLLBACK");return backTo("/conferencia?erro=invalido");}
    for(const p of found.rows){
      if(p.aprovado_em || p.duplicada_de || !p.revisada_em || p.status!=="pronto" ||
         !await canAccessTitular(user,Number(p.titular_id),"approve")){
        await cx.query("ROLLBACK");return backTo("/conferencia?erro=nao-conferido");
      }
    }
    for(const p of found.rows){
      const duplicate=await checkDuplicate(cx,{
        titularId:Number(p.titular_id),documentType:p.documento_tipo,
        reference:p.referencia,paymentDate:p.data_pagamento,amount:p.valor,
        counterparty:p.contraparte,type:p.tipo
      });
      if(duplicate){
        await cx.query("ROLLBACK");
        return backTo("/conferencia?erro="+
          (duplicate.level==="strong"?"duplicado":"semelhante-lote")+"&id="+p.id+batch);
      }
      let categoryId=p.categoria_id?Number(p.categoria_id):null;
      if(categoryId){
        const match=await cx.query("SELECT 1 FROM categorias WHERE id=$1 AND ativa=TRUE",[categoryId]);
        if(!match.rowCount){await cx.query("ROLLBACK");return backTo("/conferencia?erro=categoria"+batch);}
      }
      if(!categoryId&&p.categoria_sugerida_nome){
        const suggestion=suggestedCategory(p.categoria_sugerida_nome);
        if(!suggestion){await cx.query("ROLLBACK");return backTo("/conferencia?erro=categoria"+batch);}
        categoryId=await confirmedCategoryId(cx,suggestion);
        await cx.query("UPDATE propostas SET categoria_id=$2 WHERE id=$1",[p.id,categoryId]);
      }
      // Um documento aprovado corresponde a um lançamento simples.
      // Relacionamentos sugeridos nunca são aceitos implicitamente.
      const created=await cx.query<{id:string}>(
        "INSERT INTO operacoes(titular_id,titulo,competencia,categoria_id,tipo,descricao,contraparte,valor,referencia,criado_por,data_pagamento,chave_duplicidade)"+
        " VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text",
        [p.titular_id,p.titulo,p.competencia,categoryId,p.tipo,p.descricao,p.contraparte,p.valor,p.referencia,user.id,p.data_pagamento,
          strongDuplicateKey(p.documento_tipo,p.referencia)]
      );
      const operationId=Number(created.rows[0].id);
      if(p.data_pagamento)await cx.query(
        "UPDATE operacoes SET data_pagamento=COALESCE(data_pagamento,$2) WHERE id=$1",
        [operationId,p.data_pagamento]
      );
      await cx.query("INSERT INTO operacao_arquivos(operacao_id,proposta_id,arquivo_id) VALUES($1,$2,$3)",[operationId,p.id,p.arquivo_id]);
      await cx.query("UPDATE propostas SET aprovado_por=$2,aprovado_em=now(),operacao_id=$3 WHERE id=$1",[p.id,user.id,operationId]);
      await cx.query(
        "INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) VALUES($1,$2,$3,$4)",
        [operationId,user.id,"aprovação",JSON.stringify({proposta:p.id,arquivo:p.arquivo_id})],
      );
      await rememberApprovedClassification(cx,p.id);
    }
    await cx.query("COMMIT");
    return backTo("/conferencia?aprovados="+ids.length+batch);
  }catch(e){
    await cx.query("ROLLBACK");console.error("Erro ao aprovar",e);
    return backTo("/conferencia?erro="+((e as {code?:string})?.code==="23505"?"duplicado":"processamento")+batch);
  }finally{cx.release();}
}
