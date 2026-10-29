import { currentUser, canAccessTitular } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { safeId, competence } from "@/lib/document-data";
import { backTo, forbidden, sameOriginPost } from "@/lib/request-security";
export const runtime="nodejs";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!sameOriginPost(request))return forbidden();
  const user=await currentUser();if(!user)return forbidden();
  const id=safeId((await params).id);if(!id)return forbidden();
  const db=getDatabase();
  const op=await db.query<{titular_id:string;excluido_em:string|null}>(
    "SELECT titular_id::text,excluido_em::text FROM operacoes WHERE id=$1",[id]);
  if(!op.rows[0])return forbidden();
  const oldTitular=Number(op.rows[0].titular_id);
  const f=await request.formData();
  const action=String(f.get("acao")||"editar");
  if(action==="excluir"||action==="restaurar"){
    if(!await canAccessTitular(user,oldTitular,"delete"))return forbidden();
    await db.query(
      action==="excluir"
        ?"UPDATE operacoes SET excluido_em=now(),alterado_por=$2,atualizado_em=now() WHERE id=$1"
        :"UPDATE operacoes SET excluido_em=NULL,alterado_por=$2,atualizado_em=now() WHERE id=$1",
      [id,user.id]);
    await db.query("INSERT INTO historico_operacoes(operacao_id,usuario_id,acao) VALUES($1,$2,$3)",[id,user.id,action]);
    return backTo("/livros/"+oldTitular);
  }
  if(!await canAccessTitular(user,oldTitular,"edit"))return forbidden();
  const titular=safeId(f.get("titularId")),cat=safeId(f.get("categoriaId"));
  const title=String(f.get("titulo")||"").trim().slice(0,170);
  const date=competence(f.get("competencia"));
  const tipo=String(f.get("tipo")||"outro");
  const description=String(f.get("descricao")||"").trim().slice(0,2000);
  const contraparte=String(f.get("contraparte")||"").trim().slice(0,150);
  const referencia=String(f.get("referencia")||"").trim().slice(0,100);
  const moneyRaw=String(f.get("valor")||"").trim().replace(",",".");
  const money=moneyRaw===""?null:Number(moneyRaw);
  // Troca de titular só pela rota dedicada /mover: evita quebrar vínculos de PDFs.
  if(!titular||titular!==oldTitular||!title||!date||!["despesa","outro"].includes(tipo)||
     (money!==null&&(!Number.isFinite(money)||money<0))||
     !await canAccessTitular(user,titular,"edit"))return forbidden();
  const conn=await db.connect();
  try{
    await conn.query("BEGIN");
    await conn.query(
      "UPDATE operacoes SET titular_id=$2,titulo=$3,competencia=$4,categoria_id=$5,tipo=$6,descricao=$7,"+
      "contraparte=$8,referencia=$9,valor=$10,alterado_por=$11,atualizado_em=now() WHERE id=$1",
      [id,titular,title,date,cat,tipo,description,contraparte,referencia,money,user.id],
    );
    await conn.query("UPDATE propostas SET titular_id=$2 WHERE operacao_id=$1",[id,titular]);
    await conn.query("INSERT INTO historico_operacoes(operacao_id,usuario_id,acao) VALUES($1,$2,'edição')",[id,user.id]);
    await conn.query("COMMIT");
  }catch(e){await conn.query("ROLLBACK");throw e;}finally{conn.release();}
  return backTo("/livros/"+titular+"?op="+id);
}
