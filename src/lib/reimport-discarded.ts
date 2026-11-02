import type {PoolClient} from "pg";

// O descarte oculta o documento da fila atual, nunca proíbe um novo envio.
// Não restaura propostas descartadas: um reenvio cria uma nova conferência.
export type DiscardedOriginal={
  id:string; titular_envio_id:string; status:string;
  armazenamento:string; descartado_em:string|null;
};

export function reimportDecision(file:DiscardedOriginal, canAccessOriginal:boolean):
  "not_discarded"|"restricted"|"processing"|"restore" {
  if(!file.descartado_em)return "not_discarded";
  if(!canAccessOriginal||file.armazenamento!=="local")return "restricted";
  // Um OCR ainda executando pode gravar resultados após o reenvio.
  if(file.status==="processando")return "processing";
  return "restore";
}

export async function reopenDiscardedDocument(
  cx:Pick<PoolClient,"query">,
  fileId:string,
  titularId:number,
  uploaderId:number
):Promise<"reprocessado"|"ja_aprovado"> {
  // A proteção de verdade é o lançamento já aprovado, não o histórico de descarte.
  const approved=await cx.query(
    "SELECT 1 FROM propostas WHERE arquivo_id=$1 AND aprovado_em IS NOT NULL LIMIT 1",
    [fileId]);
  if(approved.rowCount)return "ja_aprovado";

  // Histórico anterior permanece para auditoria; não reaproveitar revisão antiga.
  await cx.query(
    "UPDATE propostas SET descartado_em=now(),descartado_por=$2 "+
    "WHERE arquivo_id=$1 AND aprovado_em IS NULL AND descartado_em IS NULL",
    [fileId,uploaderId]);
  await cx.query(
    "UPDATE lote_itens SET arquivo_id=NULL,status_entrada='descartado',"+
    "erro='Documento descartado; reenviado posteriormente' WHERE arquivo_id=$1",
    [fileId]);
  await cx.query(
    "UPDATE arquivos SET descartado_em=NULL,descartado_por=NULL,"+
    "titular_envio_id=$2,enviado_por=$3,status='aguardando',"+
    "progresso_etapa='aguardando',progresso_dados='{}'::jsonb,"+
    "erro=NULL,texto_extraido='',atualizado_em=now() WHERE id=$1",
    [fileId,titularId,uploaderId]);
  return "reprocessado";
}
