import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { sameOriginPost, forbidden, backTo } from "@/lib/request-security";
export const runtime="nodejs";
export async function POST(request:Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const f=await request.formData();
  const id=safeId(f.get("arquivoId"));if(!id)return forbidden();
  const db=getDatabase();
  const r=await db.query<{titular_envio_id:string;status:string}>(
    "SELECT titular_envio_id::text,status FROM arquivos WHERE id=$1",[id]);
  const file=r.rows[0];
  if(!file||!await canAccessTitular(user,Number(file.titular_envio_id),"import"))return forbidden();
  if(file.status==="erro"){
    await db.query("UPDATE arquivos SET status='aguardando',erro=NULL,atualizado_em=now() WHERE id=$1 AND status='erro'",[id]);
  }
  return backTo("/importar");
}
