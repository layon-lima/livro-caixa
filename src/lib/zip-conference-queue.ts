import type {ZipBatchEntry} from "./zip-batch-status";

export type ZipQueueStatus=
  "pendente"|"revisado"|"aprovado"|"aguardando"|"processando"|"erro"|
  "duplicado"|"recebendo"|"ja-existente"|"descartado"|"sem-proposta";
export type ZipQueueProposal={
  id:string;arquivo_id:string;titulo:string;nome_titular:string;
  referencia?:string|null;revisada_em?:string|null;duplicada_de?:string|null;
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
  entries:ZipBatchEntry[],pending:ZipQueueProposal[]
):ZipQueueItem[]{
  const pendingByFile=new Map<string,ZipQueueProposal[]>();
  for(const p of pending){
    const group=pendingByFile.get(p.arquivo_id)||[];
    group.push(p);pendingByFile.set(p.arquivo_id,group);
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
        const rows:ZipQueueItem[]=proposals.filter(p=>!p.duplicada_de).map(p=>({
          id:p.id,arquivo_id:file,
          // A descrição do OCR será usada somente depois da aprovação.
          titulo:entry.nome_entrada,
          nome_titular:p.nome_titular,status:p.revisada_em?"revisado":"pendente",
          referencia:p.referencia,ordinal
        }));
        if(rows.length)return rows;
        return []; // Falha sem proposta fica visível no relatório por arquivo.
      }
      // Aprovado não volta à fila se o arquivo continua associado ao lote.
      if(entry.tem_aprovado&&!entry.tem_pendente)return [];
      return [base(entry.leitura_status==="processando"?"processando":"aguardando",
        entry.leitura_status==="processando"?"OCR em andamento":"Aguardando leitura OCR")];
    }
    return [];
  });
}
