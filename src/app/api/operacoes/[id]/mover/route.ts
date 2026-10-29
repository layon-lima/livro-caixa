import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId } from "@/lib/document-data";
import { sameOriginPost, forbidden, backTo } from "@/lib/request-security";
export const runtime="nodejs";

// Só move a operação e documentos quando os arquivos pertencem exclusivamente
// à operação. Documentos compartilhados precisam de tratamento individual.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const id=safeId((await params).id);if(!id)return forbidden();
  const form=await request.formData();
  const destination=safeId(form.get("destinoId"));
  if(!destination)return forbidden();
  const db=getDatabase();
  const conn=await db.connect();
  try{
    await conn.query("BEGIN");
    const result=await conn.query<{titular_id:string;excluido_em:string|null}>(
      "SELECT titular_id::text,excluido_em::text FROM operacoes WHERE id=$1 FOR UPDATE",[id]);
    const op=result.rows[0];
    if(!op||op.excluido_em||destination===Number(op.titular_id)||
      !await canAccessTitular(user,Number(op.titular_id),"edit")||
      !await canAccessTitular(user,destination,"edit")){
      await conn.query("ROLLBACK");return forbidden();
    }
    const shared=await conn.query(
      "SELECT a.id FROM arquivos a JOIN operacao_arquivos oa ON oa.arquivo_id=a.id "+
      "WHERE oa.operacao_id=$1 AND (a.titular_envio_id<>$2 OR EXISTS ("+
      "SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND "+
      "(p.operacao_id IS DISTINCT FROM $1 OR p.aprovado_em IS NULL))) "+
      "LIMIT 1",[id,op.titular_id]);
    if(shared.rowCount){
      await conn.query("ROLLBACK");
      return backTo("/livros/"+op.titular_id+"?erro=arquivo-compartilhado");
    }
    // Atualiza os vínculos antes do arquivo; todas as mudanças são atômicas.
    await conn.query("UPDATE operacoes SET titular_id=$2,alterado_por=$3,atualizado_em=now() WHERE id=$1",
      [id,destination,user.id]);
    await conn.query("UPDATE propostas SET titular_id=$2 WHERE operacao_id=$1",[id,destination]);
    await conn.query(
      "UPDATE arquivos SET titular_envio_id=$2,atualizado_em=now() WHERE id IN "+
      "(SELECT DISTINCT arquivo_id FROM operacao_arquivos WHERE operacao_id=$1)",
      [id,destination]);
    await conn.query("INSERT INTO historico_operacoes(operacao_id,usuario_id,acao,dados) "+
      "VALUES($1,$2,'movimentação',$3::jsonb)",
      [id,user.id,JSON.stringify({origem:op.titular_id,destino:destination})]);
    await conn.query("COMMIT");
    return backTo("/livros/"+destination+"?op="+id);
  }catch(e){
    await conn.query("ROLLBACK").catch(()=>{});
    console.error("Falha ao mover operação",id,e);
    return backTo("/?erro=movimentacao");
  }finally{conn.release();}
}