// Tradução fiel do resultado do ZIP para a conferência.
// A existência de uma proposta antiga NÃO significa aprovação no lote atual.
export type ZipBatchEntry={
  ordem:number;
  nome_entrada:string;
  status_entrada:string;
  erro:string;
  arquivo_id:string|null;
  leitura_status:string|null;
  leitura_erro:string|null;
  tem_pendente:boolean;
  tem_aprovado:boolean;
};
export type ZipEntryView={label:string;group:"new"|"duplicate"|"problem"|"done";description:string};
export function describeZipEntry(entry:ZipBatchEntry):ZipEntryView{
  const status=entry.status_entrada;
  if(status==="importado"||status==="reprocessado"){
    if(entry.leitura_status==="erro")return {label:"Erro no OCR",group:"problem",
      description:entry.leitura_erro||"Falha na leitura do documento."};
    if(entry.tem_aprovado&&!entry.tem_pendente)return {label:"Aprovado neste lote",group:"done",description:"Documento conferido e aprovado."};
    if(entry.tem_pendente)return {label:"Para conferir",group:"new",description:"Documento disponível para conferência."};
    if(entry.leitura_status==="processando")return {label:"Em análise",group:"new",description:"OCR e IA processando o documento."};
    if(entry.leitura_status==="aguardando")return {label:"Aguardando leitura",group:"new",description:"Aguardando sua vez no processamento."};
    if(entry.leitura_status==="pronto")return {label:"Sem proposta",group:"problem",
      description:"A leitura terminou, mas não gerou proposta. Verifique o arquivo em Importar."};
    return {label:"Aguardando leitura",group:"new",description:"O documento foi recebido."};
  }
  if(status==="duplicado"||status==="ja_aprovado"||status==="aprovado_outro_titular"){
    if(status==="ja_aprovado"||status==="aprovado_outro_titular"||entry.tem_aprovado)
      return {label:"Já aprovado antes",group:"duplicate",
        description:"O documento já existia e foi aprovado anteriormente; não foi lançado novamente."};
    return {label:"Já cadastrado",group:"duplicate",
      description:"Mesmo arquivo identificado no acervo, sem criar novo lançamento."};
  }
  if(status==="outro_titular")return {label:"Já existe em outro livro",group:"duplicate",
    description:"Arquivo cadastrado anteriormente em outro titular autorizado."};
  if(status==="duplicado_restrito")return {label:"Arquivo já existente",group:"duplicate",
    description:"O sistema bloqueou a duplicidade sem revelar dados de outro livro."};
  if(status==="descartado")return {label:"Descartado anteriormente",group:"duplicate",
    description:"O arquivo foi descartado e não entrou novamente na fila."};
  return {label:"Não importado",group:"problem",description:entry.erro||"Este arquivo não pôde ser importado."};
}
export function summarizeZipBatch(entries:ZipBatchEntry[]){
  const groups={new:0,duplicate:0,problem:0,done:0};
  for(const entry of entries)groups[describeZipEntry(entry).group]++;
  return {total:entries.length,...groups};
}
