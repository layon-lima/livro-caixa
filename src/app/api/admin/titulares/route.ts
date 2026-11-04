import {currentUser} from "@/lib/auth";
import {getDatabase} from "@/lib/database";
import {safeId} from "@/lib/document-data";
import {backTo,forbidden,sameOriginPost} from "@/lib/request-security";
export const runtime="nodejs";
const path="/admin?tab=titulares";
const fail=(reason:string)=>backTo(path+"&error="+reason);
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const admin=await currentUser();
  if(!admin?.isAdmin)return forbidden();
  const form=await request.formData();
  const action=String(form.get("acao")||"criar");
  if(!["criar","editar","excluir","restaurar"].includes(action))return fail("dados");
  const id=safeId(form.get("id"));
  if(action!=="criar"&&!id)return fail("dados");
  const nome=String(form.get("nome")||"").trim().replace(/\s+/g," ").toLocaleUpperCase("pt-BR");
  if((action==="criar"||action==="editar")&&(nome.length<3||nome.length>120))
    return fail("dados");
  const db=getDatabase(),cx=await db.connect();
  try{
    await cx.query("BEGIN");
    if(action==="criar"){
      // Evita duplicar um livro arquivado com o mesmo titular.
      const match=await cx.query<{id:string;ativo:boolean}>(
        "SELECT id::text,ativo FROM titulares WHERE nome=$1 FOR UPDATE",[nome]);
      if(match.rows[0]){
        await cx.query("ROLLBACK");
        return fail(match.rows[0].ativo?"duplicado":"arquivada");
      }
      await cx.query("INSERT INTO titulares(nome) VALUES($1)",[nome]);
    }else if(action==="editar"){
      const found=await cx.query("UPDATE titulares SET nome=$2 WHERE id=$1 AND ativo=TRUE RETURNING id",
        [id,nome]);
      if(!found.rowCount){await cx.query("ROLLBACK");return fail("dados");}
    }else{
      const found=await cx.query(
        "UPDATE titulares SET ativo=$2 WHERE id=$1 AND ativo<>$2 RETURNING id",
        [id,action==="restaurar"]);
      if(!found.rowCount){await cx.query("ROLLBACK");return fail("dados");}
    }
    await cx.query("COMMIT");
    return backTo(path+(action==="criar"?"&created=1":"&saved=1"));
  }catch(e){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Falha ao administrar titular",e);
    return fail((e as {code?:string})?.code==="23505"?"duplicado":"processamento");
  }finally{cx.release();}
}
