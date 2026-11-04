import {currentUser} from "@/lib/auth";
import {getDatabase} from "@/lib/database";
import {safeId} from "@/lib/document-data";
import {backTo,forbidden,sameOriginPost} from "@/lib/request-security";
import {normalizeCategory,suggestedCategory} from "@/lib/category-suggestions";
export const runtime="nodejs";
const path="/admin?tab=categorias";
const fail=(error:string)=>backTo(path+"&error="+error);
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user?.isAdmin)return forbidden();
  const form=await request.formData();
  const action=String(form.get("acao")||"criar");
  const id=safeId(form.get("id"));
  if(!["criar","editar","excluir","restaurar"].includes(action))return fail("dados");
  if(action!=="criar"&&!id)return fail("dados");
  const suggestion=action==="criar"||action==="editar"?suggestedCategory(form.get("nome")):null;
  if((action==="criar"||action==="editar")&&!suggestion)return fail("dados");
  const db=getDatabase();
  const cx=await db.connect();
  try{
    await cx.query("BEGIN");
    await cx.query("SELECT pg_advisory_xact_lock(731266202)");
    if(action==="criar"||action==="editar"){
      const existing=await cx.query<{id:string;nome:string;ativa:boolean}>(
        "SELECT id::text,nome,ativa FROM categorias WHERE subcategoria='' FOR UPDATE");
      const duplicate=existing.rows.find(c=>c.id!==String(id)&&
        normalizeCategory(c.nome)===normalizeCategory(suggestion!.nome));
      if(duplicate){
        await cx.query("ROLLBACK");
        return fail(duplicate.ativa?"duplicado":"arquivada");
      }
      if(action==="editar"){
        const result=await cx.query(
          "UPDATE categorias SET nome=$2 WHERE id=$1 AND ativa=TRUE RETURNING id",[id,suggestion!.nome]);
        if(!result.rowCount){await cx.query("ROLLBACK");return fail("dados");}
      }else{
        await cx.query(
          "INSERT INTO categorias(nome,subcategoria,ativa) VALUES($1,'',TRUE) "+
          "ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE",[suggestion!.nome]);
      }
    }else{
      const result=await cx.query(
        "UPDATE categorias SET ativa=$2 WHERE id=$1 AND subcategoria='' AND ativa<>$2 RETURNING id",
        [id,action==="restaurar"]);
      if(!result.rowCount){await cx.query("ROLLBACK");return fail("dados");}
    }
    await cx.query("COMMIT");
    return backTo(path+(action==="criar"?"&created=1":"&saved=1"));
  }catch(e){
    await cx.query("ROLLBACK").catch(()=>{});
    console.error("Falha ao administrar categoria",e);
    return fail((e as {code?:string})?.code==="23505"?"duplicado":"processamento");
  }finally{cx.release();}
}
