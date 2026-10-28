import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime="nodejs";

export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const form=await request.formData();
  const ids=[...new Set(form.getAll("ids").map(safeId).filter((n):n is number=>n!==null))];
  if(!ids.length||ids.length>100)return backTo("/conferencia?erro=selecione");
  const db=getDatabase();
  const cx=await db.connect();
  try{
    await cx.query("BEGIN");
    const found=await cx.query<{
      id:string;arquivo_id:string;titular_id:string;titulo:string;documento_tipo:string;
      competencia:string;categoria_id:string|null;tipo:string;descricao:string;contraparte:string;
      valor:string|null;referencia:string;operacao_sugerida_id:string|null;revisada_em:string|null;
      aprovado_em:string|null;status:string;duplicada_de:string|null;
    }>(
      "SELECT p.id::text,p.arquivo_id::text,p.titular_id::text,p.titulo,p.documento_tipo,p.competencia::text,"+
      "p.categoria_id::text,p.tipo,p.descricao,p.contraparte,p.valor::text,p.referencia,p.operacao_sugerida_id::text,"+
      "p.revisada_em::text,p.aprovado_em::text,p.duplicada_de::text,a.status "+
      "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id WHERE p.id=ANY($1::bigint[]) FOR UPDATE OF p",
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
      let operationId=p.operacao_sugerida_id?Number(p.operacao_sugerida_id):null;
      if(operationId){
        const match=await cx.query(
          "SELECT 1 FROM operacoes WHERE id=$1 AND titular_id=$2 AND excluido_em IS NULL FOR UPDATE",
          [operationId,p.titular_id]);
        if(!match.rowCount){await cx.query("ROLLBACK");return backTo("/conferencia?erro=vinculo");}
      }else{
        const created=await cx.query<{id:string}>(
          "INSERT INTO operacoes(titular_id,titulo,competencia,categoria_id,tipo,descricao,contraparte,valor,referencia,criado_por)"+
          " VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text",
          [p.titular_id,p.titulo,p.competencia,p.categoria_id,p.tipo,p.descricao,p.contraparte,p.valor,p.referencia,user.id],
        );
        operationId=Number(created.rows[0].id);
      }
      await cx.query("INSERT INTO operacao_arquivos(operacao_id,proposta_id,arquivo_id) VALUES($1,$2,$3)",[operationId,p.id,p.arquivo_id]);
      await cx.query("UPDATE propostas SET aprovado_por=$2,aprovado_em=now(),operacao_id=$3 WHERE id=$1",[p.id,user.id,operationId]);
      await cx.query(
        "INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) VALUES($1,$2,$3,$4)",
        [operationId,user.id,"aprovação",JSON.stringify({proposta:p.id,arquivo:p.arquivo_id})],
      );
    }
    await cx.query("COMMIT");
    return backTo("/conferencia?aprovados="+ids.length);
  }catch(e){
    await cx.query("ROLLBACK");console.error("Erro ao aprovar",e);
    return backTo("/conferencia?erro=processamento");
  }finally{cx.release();}
}
