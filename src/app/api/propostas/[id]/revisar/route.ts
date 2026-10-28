import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId, competence } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime = "nodejs";

export async function POST(request: Request, {params}:{params:Promise<{id:string}>}) {
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const id=safeId((await params).id);if(!id)return forbidden();
  const db=getDatabase();
  const old=await db.query<{titular_id:string;aprovado_em:string|null}>(
    "SELECT titular_id::text,aprovado_em::text FROM propostas WHERE id=$1",[id]);
  if(!old.rows[0]||old.rows[0].aprovado_em)return forbidden();
  if(!await canAccessTitular(user,Number(old.rows[0].titular_id),"approve"))return forbidden();
  const form=await request.formData();
  const titular=safeId(form.get("titularId"));
  const categoria=form.get("categoriaId")?safeId(form.get("categoriaId")):null;
  const data=competence(form.get("competencia"));
  const titulo=String(form.get("titulo")||"").trim().slice(0,170);
  const tipo=String(form.get("tipo")||"outro");
  const documentoTipo=String(form.get("documentoTipo")||"outro").trim().slice(0,70);
  const contraparte=String(form.get("contraparte")||"").trim().slice(0,150);
  const descricao=String(form.get("descricao")||"").trim().slice(0,2000);
  const referencia=String(form.get("referencia")||"").trim().slice(0,100);
  const valorRaw=String(form.get("valor")||"").trim().replace(",",".");
  const valor=valorRaw===""?null:Number(valorRaw);
  const suggested=safeId(form.get("operacaoId"));
  if(!titular||!data||!titulo||!["receita","despesa","outro"].includes(tipo)||
      (valor!==null&&(!Number.isFinite(valor)||valor<0||valor>1e14))||
      !await canAccessTitular(user,titular,"approve"))
    return backTo("/conferencia?erro=dados");
  if(categoria){
    const exists=await db.query("SELECT 1 FROM categorias WHERE id=$1",[categoria]);
    if(!exists.rowCount)return backTo("/conferencia?erro=categoria");
  }
  if(suggested){
    const exists=await db.query("SELECT 1 FROM operacoes WHERE id=$1 AND titular_id=$2 AND excluido_em IS NULL",[suggested,titular]);
    if(!exists.rowCount)return backTo("/conferencia?erro=vinculo");
  }
  await db.query(
    "UPDATE propostas SET titular_id=$2,titulo=$3,documento_tipo=$4,contraparte=$5,competencia=$6,"+
    "competencia_estimada=FALSE,categoria_id=$7,tipo=$8,descricao=$9,valor=$10,referencia=$11,"+
    "operacao_sugerida_id=$12,revisada_por=$13,revisada_em=now() WHERE id=$1 AND aprovado_em IS NULL",
    [id,titular,titulo,documentoTipo,contraparte,data,categoria,tipo,descricao,valor,referencia,suggested,user.id],
  );
  return backTo("/conferencia?revisada="+id);
}
