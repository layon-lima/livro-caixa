import {FileArchive} from "lucide-react";
import {describeZipEntry,summarizeZipBatch,type ZipBatchEntry} from "@/lib/zip-batch-status";

export function ZipBatchReport({items,status,name}:{
  items:ZipBatchEntry[];status:string;name:string;
}){
  const count=summarizeZipBatch(items);
  const active=status==="recebendo"||status==="extraindo"||
    items.some(item=>item.leitura_status==="aguardando"||item.leitura_status==="processando");
  return <section className="zip-report" aria-label="Resultado da importação ZIP">
    <div className="zip-report-head">
      <FileArchive size={18} strokeWidth={1.7}/>
      <div><strong title={name}>Resultado do ZIP</strong>
        <small title={name}>{name}</small>
      </div>
      <span>{status==="recebendo"?"Recebendo":status==="extraindo"?"Extraindo":
        active?"Em processamento":status==="erro"?"Com erro":"Extração concluída"}</span>
    </div>
    <div className="zip-report-metrics">
      <div><strong>{count.total}</strong><span>Entradas verificadas</span></div>
      <div><strong>{count.new}</strong><span>Novos / para analisar</span></div>
      <div><strong>{count.done}</strong><span>Aprovados neste lote</span></div>
      <div><strong>{count.duplicate}</strong><span>Já existentes</span></div>
      <div><strong>{count.problem}</strong><span>Com problema</span></div>
    </div>
    {status==="pronto"&&count.total>0&&count.duplicate===count.total&&
      <p className="zip-report-note">Todos os arquivos deste ZIP já existiam no acervo. Para evitar duplicidade, não foram criados novos lançamentos.</p>}
    {status==="pronto"&&count.problem>0&&
      <p className="zip-report-note">Alguns arquivos não foram importados ou não geraram proposta. Veja os motivos abaixo.</p>}
    <details className="zip-report-details">
      <summary>Ver resultado de cada arquivo ({count.total})</summary>
      <div className="zip-report-items">
        {items.map(entry=>{
          const state=describeZipEntry(entry);
          return <div className="zip-report-item" key={entry.ordem}>
            <span className="zip-report-filename" title={entry.nome_entrada}>{entry.ordem}. {entry.nome_entrada}</span>
            <span className={"zip-report-tag zip-report-"+state.group}>{state.label}</span>
            {(state.group==="problem"||state.group==="duplicate")&&
              <small title={state.description}>{state.description}</small>}
          </div>;
        })}
        {!items.length&&<p className="muted">Nenhum arquivo cadastrado neste lote até o momento.</p>}
      </div>
    </details>
  </section>;
}
