import { currentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime="nodejs";

export async function POST(request:Request) {
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user?.isAdmin)return forbidden();
  const form=await request.formData();
  const nome=String(form.get("nome")||"").trim().slice(0,90);
  const subcategoria=String(form.get("subcategoria")||"").trim().slice(0,90);
  const id=safeId(form.get("id"));
  if(!nome)return backTo("/admin?error=dados");
  const db=getDatabase();
  try{
    if(id){
      const r=await db.query("UPDATE categorias SET nome=$2,subcategoria=$3 WHERE id=$1 RETURNING id",[id,nome,subcategoria]);
      return backTo(r.rowCount?"/admin?saved=1":"/admin?error=dados");
    }
    const r=await db.query("INSERT INTO categorias(nome,subcategoria) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",[nome,subcategoria]);
    return backTo(r.rowCount?"/admin?created=1":"/admin?error=duplicado");
  }catch{
    return backTo("/admin?error=duplicado");
  }
}
