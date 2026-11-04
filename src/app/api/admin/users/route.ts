import {currentUser} from "@/lib/auth";
import {getDatabase} from "@/lib/database";
import {safeId} from "@/lib/document-data";
import {hashPassword,validPassword} from "@/lib/passwords";
import {backTo,forbidden,sameOriginPost} from "@/lib/request-security";
export const runtime="nodejs";
const path="/admin?tab=usuarios";
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
  const username=String(form.get("username")||"").trim().toLowerCase();
  if((action==="criar"||action==="editar")&&!/^[a-z0-9._-]{3,32}$/.test(username))
    return fail("dados");
  const db=getDatabase(),cx=await db.connect();
  try{
    if(action==="criar"){
      const password=String(form.get("password")||"");
      if(!validPassword(password))return fail("senha");
      const hashed=await hashPassword(password);
      const result=await cx.query(
        "INSERT INTO users(username,password_hash) VALUES($1,$2) "+
        "ON CONFLICT(username) DO NOTHING RETURNING id",[username,hashed]);
      return result.rowCount?backTo(path+"&created=1"):fail("duplicado");
    }
    await cx.query("BEGIN");
    const existing=await cx.query<{id:string;is_admin:boolean;is_active:boolean}>(
      "SELECT id::text,is_admin,is_active FROM users WHERE id=$1 FOR UPDATE",[id]);
    const target=existing.rows[0];
    if(!target){await cx.query("ROLLBACK");return fail("dados");}
    if(action==="editar"){
      const result=await cx.query("UPDATE users SET username=$2 WHERE id=$1 RETURNING id",
        [id,username]);
      if(!result.rowCount){await cx.query("ROLLBACK");return fail("dados");}
    }else if(action==="excluir"){
      // Nunca desativar a própria sessão nem um administrador.
      if(target.is_admin||id===admin.id){await cx.query("ROLLBACK");return fail("administrador");}
      await cx.query("UPDATE users SET is_active=FALSE WHERE id=$1",[id]);
      await cx.query("DELETE FROM user_sessions WHERE user_id=$1",[id]);
    }else{
      await cx.query("UPDATE users SET is_active=TRUE,failed_attempts=0,locked_until=NULL WHERE id=$1",[id]);
    }
    await cx.query("COMMIT");
    return backTo(path+"&saved=1");
  }catch(e){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Falha ao administrar usuário",e);
    return fail((e as {code?:string})?.code==="23505"?"duplicado":"processamento");
  }finally{cx.release();}
}
