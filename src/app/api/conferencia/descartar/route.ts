import {currentUser,canAccessTitular} from "@/lib/auth";
import {safeId} from "@/lib/document-data";
import {getDatabase} from "@/lib/database";
import {sameOriginPost,forbidden,backTo} from "@/lib/request-security";
export const runtime="nodejs";

// Descarte lógico, mantendo os originais e o histórico de auditoria.
// Nunca altera um lançamento aprovado.
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const form=await request.formData();
  const proposalId=safeId(form.get("propostaId"));
  const fileId=safeId(form.get("arquivoId"));
  if(Boolean(proposalId)===Boolean(fileId))return forbidden();

  const raw=String(form.get("arquivos")||"");
  const lote=String(form.get("lote")||"");
  const suffix=/^\d+(?:,\d+){0,99}$/.test(raw)?"&arquivos="+raw:
    /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(lote)?
    "&lote="+encodeURIComponent(lote):"";
  const imported=String(form.get("origem")||"")==="importar";
  const done=(status:string)=>backTo(imported?"/importar?"+status:"/conferencia?"+status+suffix);
  const cx=await getDatabase().connect();
  try{
    await cx.query("BEGIN");
    if(proposalId){
      const found=await cx.query<{arquivo_id:string;titular_id:string;aprovado_em:string|null;descartado_em:string|null}>(
        "SELECT p.arquivo_id::text,p.titular_id::text,p.aprovado_em::text,p.descartado_em::text "+
        "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id "+
        "WHERE p.id=$1 FOR UPDATE OF p,a",[proposalId]);
      const item=found.rows[0];
      if(!item||item.aprovado_em||item.descartado_em||
         !await canAccessTitular(user,Number(item.titular_id),"approve")){
        await cx.query("ROLLBACK");return done("erro=nao-autorizado");
      }
      await cx.query("UPDATE propostas SET descartado_em=now(),descartado_por=$2 WHERE id=$1",
        [proposalId,user.id]);
      // Descartar somente essa proposta se o arquivo tiver outras partes aprovadas/pendentes.
      const remaining=await cx.query(
        "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND (aprovado_em IS NOT NULL OR descartado_em IS NULL) LIMIT 1",
        [item.arquivo_id]);
      if(!remaining.rowCount)await cx.query(
        "UPDATE arquivos SET descartado_em=now(),descartado_por=$2 WHERE id=$1 AND descartado_em IS NULL",
        [item.arquivo_id,user.id]);
    }else{
      const file=await cx.query<{titular_envio_id:string;descartado_em:string|null}>(
        "SELECT titular_envio_id::text,descartado_em::text FROM arquivos WHERE id=$1 FOR UPDATE",[fileId]);
      const row=file.rows[0];
      if(!row||row.descartado_em||
         (!await canAccessTitular(user,Number(row.titular_envio_id),"import")&&
          !await canAccessTitular(user,Number(row.titular_envio_id),"approve"))){
        await cx.query("ROLLBACK");return done("erro=nao-autorizado");
      }
      const approved=await cx.query("SELECT 1 FROM propostas WHERE arquivo_id=$1 AND aprovado_em IS NOT NULL LIMIT 1",[fileId]);
      if(approved.rowCount){await cx.query("ROLLBACK");return done("erro=ja-aprovado");}
      await cx.query("UPDATE arquivos SET descartado_em=now(),descartado_por=$2 WHERE id=$1",[fileId,user.id]);
      await cx.query("UPDATE propostas SET descartado_em=now(),descartado_por=$2 "+
        "WHERE arquivo_id=$1 AND aprovado_em IS NULL AND descartado_em IS NULL",[fileId,user.id]);
    }
    await cx.query("COMMIT");
    return done("descartado=1");
  }catch(e){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Falha ao descartar documento",e);
    return done("erro=descarte");
  }finally{cx.release();}
}
