import type {ZipBatchEntry} from "./zip-batch-status";

export type ZipQueueStatus=
  "pendente"|"revisado"|"aprovado"|"aguardando"|"processando"|"erro"|
  "duplicado"|"recebendo"|"ja-existente"|"descartado"|"sem-proposta";
export type ZipQueueProposal={
  id:string;arquivo_id:string;titulo:string;nome_titular:string;
  referencia?:string|null;revisada_em?:string|null;duplicada_de?:string|null;
};
export type ZipQueueApproved={
  id:string;arquivo_id:string;operacao_id:string|null;titulo:string;nome_titular:string;
};
export type ZipQueueItem={
  id:string;arquivo_id:string;titulo:string;nome_titular:string;
  status:ZipQueueStatus;referencia?:string|null;operacao_id?:string|null;
  ordinal?:number;
};

/** Lista CADA entrada do ZIP mesmo sem arquivo/proposta.
 * Documentos com múltiplas propostas mostram cada subproposta na mesma posição.
 */
export function buildZipQueue(
  entries:ZipBatchEntry[],pending:ZipQueueProposal[],approved:ZipQueueApproved[]
):ZipQueueItem[]{
  const pendingByFile=new Map<string,ZipQueueProposal[]>();
  const approvedByFile=new Map<string,ZipQueueApproved[]>();
  for(const p of pending){
    const group=pendingByFile.get(p.arquivo_id)||[];
    group.push(p);pendingByFile.set(p.arquivo_id,group);
  }
  for(const p of approved){
    const group=approvedByFile.get(p.arquivo_id)||[];
    group.push(p);approvedByFile.set(p.arquivo_id,group);
  }
  return entries.flatMap(entry=>{
    const file=entry.arquivo_id||"";
    const ordinal=entry.ordem;
    const base=(status:ZipQueueStatus,detail:string):ZipQueueItem=>({
      id:"zip-"+ordinal,arquivo_id:file,titulo:entry.nome_entrada,
      nome_titular:detail,status,ordinal
    });
    if(entry.status_entrada==="pendente")
      return [base("recebendo","Aguardando extração do ZIP")];
    if(entry.status_entrada==="importado"||entry.status_entrada==="reprocessado"){
      if(entry.leitura_status==="erro")
        return [base("erro",entry.leitura_erro||"Erro na leitura OCR")];
      if(entry.leitura_status==="pronto"){
        const proposals=pendingByFile.get(file)||[];
        const accepted=approvedByFile.get(file)||[];
        const rows:ZipQueueItem[]=proposals.map(p=>({
          id:p.id,arquivo_id:file,
          titulo:proposals.length===1?p.titulo:entry.nome_entrada+" — "+p.titulo,
          nome_titular:p.nome_titular,status:p.duplicada_de?"duplicado":
            p.revisada_em?"revisado":"pendente",
          referencia:p.referencia,ordinal
        }));
        rows.push(...accepted.map(p=>({
          id:"approved-"+p.id,arquivo_id:file,titulo:p.titulo,
          nome_titular:p.nome_titular,status:"aprovado" as const,
          operacao_id:p.operacao_id,ordinal
        })));
        if(rows.length)return rows;
        return [base("sem-proposta","OCR finalizado sem documento disponível para validar")];
      }
      return [base(entry.leitura_status==="processando"?"processando":"aguardando",
        entry.leitura_status==="processando"?"OCR/IA em andamento":"Aguardando leitura OCR")];
    }
    if(entry.status_entrada==="descartado")
      return [base("descartado","Descartado na conferência")];
    if(["duplicado","ja_aprovado","aprovado_outro_titular","outro_titular",
       "duplicado_restrito"].includes(entry.status_entrada))
      return [base("ja-existente","Arquivo já existente; não gerou nova proposta")];
    return [base("erro",entry.erro||"Arquivo não importado")];
  });
}
