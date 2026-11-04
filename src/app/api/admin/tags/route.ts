import {currentUser} from "@/lib/auth";
import {getDatabase} from "@/lib/database";
import {safeId} from "@/lib/document-data";
import {backTo,forbidden,sameOriginPost} from "@/lib/request-security";
export const runtime="nodejs";
const path="/admin?tab=tags";
const fail=(reason:string)=>backTo(path+"&error="+reason);
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user?.isAdmin)return forbidden();
  const form=await request.formData();
  const acao=String(form.get("acao")||"criar");
  const id=safeId(form.get("id"));
  if(!["criar","editar","excluir","restaurar"].includes(acao)||
     (acao!=="criar"&&!id))return fail("dados");
  const nome=String(form.get("nome")||"").trim().replace(/\s+/g," ");
  if((acao==="criar"||acao==="editar")&&(
    nome.length<1||nome.length>60||/[<>{}\[\]\r\n]/.test(nome)))return fail("dados");
  const cx=await getDatabase().connect();
  try{
    await cx.query("BEGIN");
    await cx.query("SELECT pg_advisory_xact_lock(731266203)");
    if(acao==="criar"||acao==="editar"){
      const existing=await cx.query<{id:string;ativa:boolean}>(
        "SELECT id::text,ativa FROM tags WHERE lower(btrim(nome))=lower($1) FOR UPDATE",[nome]);
      const duplicate=existing.rows.find(x=>x.id!==String(id));
      if(duplicate){
        await cx.query("ROLLBACK");
        return fail(duplicate.ativa?"duplicado":"arquivada");
      }
      if(acao==="criar")await cx.query("INSERT INTO tags(nome) VALUES($1)",[nome]);
      else{
        const r=await cx.query("UPDATE tags SET nome=$2 WHERE id=$1 AND ativa=TRUE RETURNING id",[id,nome]);
        if(!r.rowCount){await cx.query("ROLLBACK");return fail("dados");}
      }
    }else{
      const r=await cx.query("UPDATE tags SET ativa=$2 WHERE id=$1 AND ativa<>$2 RETURNING id",
        [id,acao==="restaurar"]);
      if(!r.rowCount){await cx.query("ROLLBACK");return fail("dados");}
    }
    await cx.query("COMMIT");
    return backTo(path+(acao==="criar"?"&created=1":"&saved=1"));
  }catch(e){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Erro na administração das tags",e);
    return fail((e as {code?:string})?.code==="23505"?"duplicado":"processamento");
  }finally{cx.release();}
}
