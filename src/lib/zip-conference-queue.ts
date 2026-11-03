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

/** Lista imediatamente os arquivos elegíveis para conferência.
 * O relatório de ZIP exibe duplicados, descartados e erros separadamente.
 * Enquanto o ZIP não foi identificado por SHA, as entradas são provisórias.
 * Documentos com várias propostas preservam cada subproposta na mesma posição.
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
    // Duplicados, descartados e arquivos recusados ficam apenas no relatório.
    // Nunca aparecem como documentos novos para validar.
    if(!["pendente","importado","reprocessado"].includes(entry.status_entrada))return [];
    const file=entry.arquivo_id||"";
    const ordinal=entry.ordem;
    const base=(status:ZipQueueStatus,detail:string):ZipQueueItem=>({
      id:"zip-"+ordinal,arquivo_id:file,titulo:entry.nome_entrada,
      nome_titular:detail,status,ordinal
    });
    if(entry.status_entrada==="pendente")
      return [base("recebendo","Aguardando extração do ZIP")];
    if(entry.status_entrada==="importado"||entry.status_entrada==="reprocessado"){
      if(entry.leitura_status==="erro")return []; // Falha de OCR no relatório, sem proposta validável.
      if(entry.leitura_status==="pronto"){
        const proposals=pendingByFile.get(file)||[];
        const accepted=approvedByFile.get(file)||[];
        const rows:ZipQueueItem[]=proposals.filter(p=>!p.duplicada_de).map(p=>({
          id:p.id,arquivo_id:file,
          titulo:proposals.length===1?p.titulo:entry.nome_entrada+" — "+p.titulo,
          nome_titular:p.nome_titular,status:p.revisada_em?"revisado":"pendente",
          referencia:p.referencia,ordinal
        }));
        rows.push(...accepted.map(p=>({
          id:"approved-"+p.id,arquivo_id:file,titulo:p.titulo,
          nome_titular:p.nome_titular,status:"aprovado" as const,
          operacao_id:p.operacao_id,ordinal
        })));
        if(rows.length)return rows;
        return []; // Falha sem proposta fica visível no relatório por arquivo.
      }
      return [base(entry.leitura_status==="processando"?"processando":"aguardando",
        entry.leitura_status==="processando"?"OCR/IA em andamento":"Aguardando leitura OCR")];
    }
    return [];
  });
}
