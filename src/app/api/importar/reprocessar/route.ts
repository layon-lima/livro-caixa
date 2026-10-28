import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { sameOriginPost, forbidden, backTo } from "@/lib/request-security";
export const runtime="nodejs";

export async function POST(request: Request){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const form=await request.formData();
  const id=safeId(form.get("arquivoId"));if(!id)return forbidden();
  const db=getDatabase();
  const connection=await db.connect();
  try{
    await connection.query("BEGIN");
    const found=await connection.query<{titular_envio_id:string;status:string;armazenamento:string}>(
      "SELECT titular_envio_id::text,status,armazenamento FROM arquivos WHERE id=$1 FOR UPDATE",[id]);
    const file=found.rows[0];
    if(!file || !await canAccessTitular(user,Number(file.titular_envio_id),"import")){
      await connection.query("ROLLBACK");return forbidden();
    }
    if(file.armazenamento!=="local" || !["pronto","erro"].includes(file.status)){
      await connection.query("ROLLBACK");return backTo("/importar?erro=reprocessamento");
    }
    // Não apagar revisões ou documentos aprovados; só refazer a leitura bruta.
    const protectedProposals=await connection.query(
      "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND (revisada_em IS NOT NULL OR aprovado_em IS NOT NULL) LIMIT 1",[id]);
    if(protectedProposals.rowCount){
      await connection.query("ROLLBACK");return backTo("/importar?erro=ja-conferido");
    }
    await connection.query("DELETE FROM propostas WHERE arquivo_id=$1",[id]);
    await connection.query(
      "UPDATE arquivos SET status='aguardando',erro=NULL,texto_extraido='',atualizado_em=now() WHERE id=$1",[id]);
    await connection.query("COMMIT");
    return backTo("/importar?reprocessado=1");
  }catch(error){
    await connection.query("ROLLBACK").catch(()=>{});
    console.error("Falha ao reprocessar documento",id,error);
    return backTo("/importar?erro=reprocessamento");
  }finally{connection.release();}
}
