import {currentUser} from "@/lib/auth";
import {getDatabase} from "@/lib/database";
import {safeId} from "@/lib/document-data";
import {backTo,forbidden,sameOriginPost} from "@/lib/request-security";
import {normalizeCategory,suggestedCategory} from "@/lib/category-suggestions";
export const runtime="nodejs";
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user?.isAdmin)return forbidden();
  const form=await request.formData();
  const suggested=suggestedCategory(form.get("nome"));
  if(!suggested)return backTo("/admin?error=dados");
  const id=safeId(form.get("id"));
  const db=getDatabase(),cx=await db.connect();
  try{
    await cx.query("BEGIN");
    const existing=await cx.query<{id:string;nome:string}>(
      "SELECT id::text,nome FROM categorias WHERE ativa=TRUE AND subcategoria='' FOR UPDATE");
    if(existing.rows.some(c=>c.id!==String(id)&&normalizeCategory(c.nome)===normalizeCategory(suggested.nome))){
      await cx.query("ROLLBACK");return backTo("/admin?error=duplicado");
    }
    if(id){
      const found=await cx.query("UPDATE categorias SET nome=$2 WHERE id=$1 AND ativa=TRUE RETURNING id",
        [id,suggested.nome]);
      if(!found.rowCount){await cx.query("ROLLBACK");return backTo("/admin?error=dados");}
    }else await cx.query("INSERT INTO categorias(nome,subcategoria,ativa) VALUES($1,'',TRUE) "+
      "ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE",[suggested.nome]);
    await cx.query("COMMIT");return backTo(id?"/admin?saved=1":"/admin?created=1");
  }catch{
    await cx.query("ROLLBACK").catch(()=>{});
    return backTo("/admin?error=duplicado");
  }finally{cx.release();}
}
