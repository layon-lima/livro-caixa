import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { categorias, titularesPermitidos, type Proposta } from "@/lib/document-data";
import {FileText, ExternalLink, ChevronRight, Save, ClipboardCheck} from "lucide-react";
import { LiveReview } from "@/components/live-review";
import { ReviewCategoryPicker } from "@/components/review-category-picker";
import {TagPicker} from "@/components/tag-picker";
import {tagsDisponiveis} from "@/lib/tags";
import { ConferenceQueue, type QueueItem } from "@/components/conference-queue";
import { suggestDocumentName } from "@/lib/document-name";
import { BatchQueueRefresh } from "@/components/batch-queue-refresh";
import { summarizeZipBatch,type ZipBatchEntry } from "@/lib/zip-batch-status";
import { buildZipQueue } from "@/lib/zip-conference-queue";
import { DiscardDocument } from "@/components/discard-document";
import { notFound } from "next/navigation";
export const dynamic="force-dynamic";
type Queued=Proposta&{nome_titular:string;duplicada_de:string|null;arquivo_original_id:string|null;titular_original_id:string|null};

export default async function Conferencia({searchParams}:{searchParams:Promise<{id?:string;arquivo?:string;arquivos?:string;lote?:string;revisada?:string;aprovados?:string;descartado?:string;erro?:string}>}){
  const user=await requireUser();
  const db=getDatabase();
  const [query,books,cats,tags]=await Promise.all([searchParams,titularesPermitidos(user,"approve"),categorias(),tagsDisponiveis()]);
  const lote=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(query.lote||"")?query.lote!:"";
  const loteInfo=lote?await db.query<{id:string;enviado_por:string;status:string;erro:string;nome_arquivo:string}>(
    "SELECT id::text,enviado_por::text,status,erro,nome_arquivo FROM lotes_importacao WHERE id=$1",[lote]):null;
  const zipBatch=loteInfo?.rows[0];
  if(lote&&(!zipBatch||(!user.isAdmin&&String(user.id)!==zipBatch.enviado_por)))notFound();
  // A fonte da verdade é lote_itens, não aprovações de imports anteriores.
  const batchRows=zipBatch?await db.query<ZipBatchEntry>(
    "SELECT li.ordem,li.nome_entrada,li.status_entrada,li.erro,li.arquivo_id::text,"+
    "a.status AS leitura_status,a.erro AS leitura_erro,"+
    "EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=li.arquivo_id AND "+
    "p.aprovado_em IS NULL AND p.descartado_em IS NULL) AS tem_pendente,"+
    "EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=li.arquivo_id AND "+
    "p.aprovado_em IS NOT NULL) AS tem_aprovado "+
    "FROM lote_itens li LEFT JOIN arquivos a ON a.id=li.arquivo_id "+
    "WHERE li.lote_id=$1 ORDER BY li.ordem LIMIT 300",[lote]
  ):null;
  const batchEntries=batchRows?.rows||[];
  const batchSummary=summarizeZipBatch(batchEntries);
  const ids=query.arquivos && /^\d+(?:,\d+){0,99}$/.test(query.arquivos)
    ? [...new Set(query.arquivos.split(",").map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0)
    : null;
  const batch=ids?.length?ids:null;
  const queryArgs:(number|string|number[])[] = user.isAdmin?[]:[user.id];
  if(lote)queryArgs.push(lote);
  else if(batch)queryArgs.push(batch);
  const scope=lote?"AND a.status=\'pronto\' AND EXISTS(SELECT 1 FROM lote_itens li WHERE li.lote_id=$"+queryArgs.length+
    " AND li.status_entrada IN (\'importado\',\'reprocessado\') AND li.arquivo_id=p.arquivo_id) ":
    batch?"AND p.arquivo_id = ANY($"+queryArgs.length+"::bigint[]) ":"";
  const rows=await db.query<Queued>(
    "SELECT p.id::text,p.arquivo_id::text,p.titular_id::text,p.titulo,p.documento_tipo,p.contraparte,"+
    "p.competencia::text,p.data_pagamento::text,p.competencia_estimada,p.categoria_id::text,p.tipo,p.descricao,p.valor::text,p.referencia,"+
    "p.pagador_identificado,p.pagina_inicial,p.pagina_final,p.metodo_leitura,p.confianca::text,p.avisos,p.titular_sugerido,p.consulta_empresa,p.categoria_sugerida_nome,p.categoria_sugerida_subcategoria,p.revisada_em::text,p.operacao_sugerida_id::text,p.aprovado_em::text,p.duplicada_de::text,"+
    "orig.arquivo_id::text AS arquivo_original_id,orig.titular_id::text AS titular_original_id,"+
    "a.nome_original,a.status,a.erro,''::text AS texto_extraido,t.nome AS nome_titular "+
    "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id JOIN titulares t ON t.id=p.titular_id "+
    "LEFT JOIN propostas orig ON orig.id=p.duplicada_de "+
    (user.isAdmin?"":"JOIN user_titular_permissions up ON up.titular_id=p.titular_id AND up.user_id=$1 AND up.can_approve=true ")+
    "WHERE p.aprovado_em IS NULL AND p.descartado_em IS NULL AND a.descartado_em IS NULL "+
    scope+
    (lote?"ORDER BY p.id ASC LIMIT 1000":"ORDER BY p.id DESC LIMIT 500"),
    queryArgs);
  const all=rows.rows;
  // Arquivos recém-enviados aparecem imediatamente, ainda sem propostas gravadas.
  // Análises podem ser retomadas sem o lote original depois de navegar.
  const pendingIds=lote?null:batch||(query.arquivo&&/^\d+$/.test(query.arquivo)?[Number(query.arquivo)]:null);
  const pendingArgs:(number|string|number[])[]=user.isAdmin?[]:[user.id];
  if(lote)pendingArgs.push(lote);
  else if(pendingIds)pendingArgs.push(pendingIds);
  const pendingExtra=lote?
    "AND EXISTS(SELECT 1 FROM lote_itens li WHERE li.lote_id=$"+pendingArgs.length+" AND li.arquivo_id=a.id) ":
    pendingIds?"AND a.id=ANY($"+pendingArgs.length+"::bigint[]) ":"";
  const pending=lote?null:await db.query<{
    id:string;nome_original:string;titular_envio_id:string;nome_titular:string;status:string;
  }>(
    "SELECT a.id::text,a.nome_original,a.titular_envio_id::text,t.nome AS nome_titular,a.status "+
    "FROM arquivos a JOIN titulares t ON t.id=a.titular_envio_id "+
    (user.isAdmin?"":"JOIN user_titular_permissions up ON up.titular_id=a.titular_envio_id "+
      "AND up.user_id=$1 AND up.can_approve=true ")+
    "WHERE a.status IN ('aguardando','processando','erro') AND a.descartado_em IS NULL "+
    "AND NOT EXISTS (SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NULL) "+
    pendingExtra+(lote?"ORDER BY a.id ASC LIMIT 300":"ORDER BY a.id DESC LIMIT 100"),
    pendingArgs
  );
  const inProgress=pending?.rows||[];
  const requested=all.find(p=>p.id===query.id);
  const activePending=requested?null:
    (query.arquivo?inProgress.find(p=>p.id===query.arquivo):
      (!query.id&&!all.length?inProgress[0]:undefined));
  const selected=requested||(!activePending?
    (query.arquivo?all.find(p=>p.arquivo_id===query.arquivo):undefined)||all[0]:undefined);
  // O texto OCR pode conter centenas de páginas: buscar somente o documento
  // selecionado, nunca todas as centenas de propostas em cada atualização.
  if(selected){
    const original=await db.query<{texto_extraido:string}>(
      "SELECT texto_extraido FROM arquivos WHERE id=$1",[selected.arquivo_id]);
    selected.texto_extraido=original.rows[0]?.texto_extraido||"";
  }
  const selectedTagRows=selected?await db.query<{tag_id:string}>(
    "SELECT tag_id::text FROM proposta_tags WHERE proposta_id=$1",[selected.id]):null;
  const selectedTags=selectedTagRows?.rows.map(x=>x.tag_id)||[];
  const selectedCat=selected?cats.find(c=>c.id===selected.categoria_id):null;
  const selectedName=selected?suggestDocumentName({
    originalName:selected.nome_original,documentType:selected.documento_tipo,
    title:selected.titulo,counterparty:selected.contraparte,description:selected.descricao,
    category:selectedCat?.nome||selected.categoria_sugerida_nome,
    paymentDate:selected.data_pagamento
  }):"";
  const queue:QueueItem[]=lote?
    buildZipQueue(batchEntries,all):
    [
      ...all.map(p=>({
        id:p.id,arquivo_id:p.arquivo_id,titulo:p.titulo,nome_titular:p.nome_titular,referencia:p.referencia,
        status:(p.duplicada_de?"duplicado":p.revisada_em?"revisado":"pendente") as QueueItem["status"]
      })),
      ...inProgress.map(p=>({
        id:"file-"+p.id,arquivo_id:p.id,titulo:p.nome_original,nome_titular:p.nome_titular,
        status:p.status as QueueItem["status"]
      }))
    ];
  const position=selected?all.findIndex(x=>x.id===selected.id):-1;
  const nextItem=selected?all.slice(position+1).find(x=>x.id!==selected.id):all[0];
  const nextHref=nextItem?"/conferencia?"+(lote?"lote="+encodeURIComponent(lote)+"&":
    batch?"arquivos="+batch.join(",")+"&":"")+"id="+nextItem.id:null;
  const batchQuery=lote?"lote="+encodeURIComponent(lote)+"&":batch?"arquivos="+batch.join(",")+"&":"";
  const formId=selected?"conf-form-"+selected.id:"";
  const pix=selected?/\bPIX\b/i.test(selected.titulo+" "+selected.documento_tipo):false;
  const typeLabel=selected?(pix?"Comprovante Pix":
    selected.documento_tipo==="nota fiscal"?"Nota fiscal":selected.documento_tipo):"";
  const needsOwner=Boolean(selected?.avisos?.some(x=>
    x.startsWith("Titular não identificado automaticamente")||
    x.startsWith("Quem fez o pagamento")||
    x.startsWith("Não foi possível identificar quem fez o pagamento")||
    x.startsWith("Quem fez o Pix")||
    x.startsWith("Não foi possível ler quem fez o Pix")));
  const realOwner=selected?(needsOwner?"Aguardando identificação":selected.nome_titular):"";
  const displayAmount=selected&&selected.valor!==null&&selected.valor!==undefined&&selected.valor!==""?
    Number(selected.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"Não identificado";
  const displayDate=selected?.data_pagamento?
    selected.data_pagamento.split("-").reverse().join("/"):"Não identificado";
  const displayMonth=selected?.competencia?
    new Date(selected.competencia.slice(0,7)+"-01T12:00:00Z").toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}):"Não identificado";
  const categoryLabel=cats.find(c=>c.id===selected?.categoria_id)?.nome||
    selected?.categoria_sugerida_nome||"Não identificada";

  return <StandaloneWorkspace title="Conferência" section="livros" focusMode>
    <div className="work-page conference-page">
      <div className="conference-layout">
        <aside className="conference-queue-pane" aria-label="Fila de documentos">
          <ConferenceQueue items={queue} queryRoot={batchQuery} selectedId={selected?.id}
            selectedFile={activePending?.id} lote={lote} arquivos={batch?.join(",")} loteTotal={batchEntries.length}/>
          <BatchQueueRefresh active={Boolean((zipBatch&&(zipBatch.status==="recebendo"||zipBatch.status==="extraindo"))||batchEntries.some(x=>x.leitura_status==="aguardando"||x.leitura_status==="processando"))}/>
        </aside>
        <main className="conference-document" id="conteudo-conferencia">
          {zipBatch&&(zipBatch.status==="recebendo"||zipBatch.status==="extraindo")&&
            <p className="form-success" role="status">
              {zipBatch.status==="recebendo"?"ZIP recebido. Preparando extração…":
                "Todos os arquivos do ZIP aparecem à esquerda; os concluídos ficam disponíveis para validar."}
            </p>}
          {zipBatch?.status==="erro"&&<p className="form-error" role="alert">
            O ZIP não foi concluído: {zipBatch.erro||"falha na extração"}. Os documentos já recebidos foram preservados.
          </p>}
          {query.erro&&<div className="form-error" role="alert">
            {query.erro==="duplicado"?
              "Lançamento bloqueado: esta transação já existe no Livro Caixa.":
              query.erro==="semelhante"?
              "Possível duplicidade: já existe um lançamento do mesmo titular, com o mesmo recebedor, valor e data. Confira o documento antes de prosseguir.":
              query.erro==="semelhante-lote"?
              "A aprovação em lote foi interrompida por um possível lançamento repetido. Confira os documentos individualmente; nada deste grupo foi aprovado.":
              "Não foi possível concluir: "+query.erro+"."}
          </div>}
          {query.descartado&&<p className="form-success" role="status">Documento descartado e retirado da fila.</p>}
          {query.revisada&&<p className="form-success" role="status">Conferência atualizada.</p>}
          {query.aprovados&&<p className="form-success" role="status">{query.aprovados} lançamento(s) salvo(s).</p>}
          {activePending?<div className="conference-panel conference-reading">
            <LiveReview key={activePending.id} arquivoId={activePending.id} nome={activePending.nome_original}
              books={books} cats={cats} isAdmin={user.isAdmin}/>
            <div className="conference-actions"><DiscardDocument arquivoId={activePending.id}
              arquivos={batch?.join(",")} lote={lote}/></div>
          </div>:!selected?<div className="conference-empty">
            <ClipboardCheck size={30}/>
            <h2>{zipBatch&&(zipBatch.status==="recebendo"||zipBatch.status==="extraindo")?"Preparando a fila de documentos…":zipBatch&&batchSummary.duplicate===batchSummary.total&&batchSummary.total>0?"Nenhum documento novo para conferir":lote&&batchEntries.some(e=>e.status_entrada==="pendente"||e.leitura_status==="aguardando"||e.leitura_status==="processando")?"Aguardando documentos ficarem prontos":lote?"Nenhum documento pendente neste ZIP":"Sua fila está vazia"}</h2>
            <p>{zipBatch&&(zipBatch.status==="recebendo"||zipBatch.status==="extraindo")?"Assim que o índice do ZIP for lido, todos os arquivos aparecerão à esquerda. Os opacos ainda não podem ser validados.":zipBatch&&batchSummary.duplicate===batchSummary.total&&batchSummary.total>0?"Todos os documentos já estavam cadastrados. Não há novos lançamentos para conferir.":lote?"Os documentos salvos saem desta fila automaticamente. Você pode importar outros arquivos.":"Importe documentos para iniciar a conferência."}</p>
            <Link className="flat-button" href="/importar">Importar documentos</Link>
          </div>:<>
            <header className="conference-doc-header">
              <div className="conference-doc-identity">
                <FileText size={21}/>
                <div><h1 title={"Original: "+selected.nome_original}>{selectedName}</h1>
                  <div className="conference-doc-tags">
                    <span>{selected.metodo_leitura==="xml"?"XML":"OCR"}</span>
                    {selected.confianca&&<span>{Math.round(Number(selected.confianca)*100)}% confiança estimada</span>}
                    {selected.pagina_inicial&&<span>{selected.pagina_final&&selected.pagina_final!==selected.pagina_inicial?
                      Number(selected.pagina_final)-Number(selected.pagina_inicial)+1:1} pág.</span>}
                  </div>
                </div>
              </div>
              <div className="conference-header-actions">
                <a className="flat-button" href={"/api/documentos/"+selected.arquivo_id}
                  target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir original</a>
                {nextHref?<Link className="flat-button" href={nextHref}>Próximo <ChevronRight size={15}/></Link>:
                  <span className="flat-button conference-disabled">Último documento</span>}

              </div>
            </header>
            <section className="conference-panel">
              <h2><FileText size={17}/> Resumo do documento</h2>
              <div className="conference-summary">
                <div><span>Tipo do documento</span><strong>{typeLabel}</strong></div>
                <div><span>{pix||selected.pagador_identificado?"Quem fez o pagamento":"Titular"}</span><strong>{selected.pagador_identificado||realOwner}</strong></div>
                <div><span>{pix?"Quem recebeu":"Fornecedor / contraparte"}</span><strong>{selected.contraparte||"Não identificado"}</strong></div>
                <div><span>Valor</span><strong>{displayAmount}</strong></div>
                <div><span>Data do pagamento</span><strong>{displayDate}</strong></div>
                <div><span>Competência</span><strong>{displayMonth}</strong></div>
                <div><span>Categoria sugerida</span><strong className={!selected.categoria_id?"conference-needs-review":""}>{categoryLabel}</strong></div>
                <div><span>Tipo sugerido</span><strong>{selected.tipo==="despesa"?"Despesa":"Outro"}</strong></div>
              </div>
            </section>
            {selected.duplicada_de&&<div className="duplicate-alert conference-panel">
              <strong>Documento já identificado anteriormente</strong>
              <span>Para evitar duplicidade, este lançamento não pode ser aprovado novamente.</span>
              {selected.arquivo_original_id&&(user.isAdmin||selected.titular_original_id===selected.titular_id)&&
                <a href={"/api/documentos/"+selected.arquivo_original_id} target="_blank" rel="noreferrer">
                  Abrir documento anterior</a>}
            </div>}
            {selected.titular_sugerido&&<div className="conference-panel conference-suggested-owner">
              <strong>Possível titular ainda não cadastrado: {selected.titular_sugerido}</strong>
              <p>O cadastro não é feito automaticamente.</p>
              {user.isAdmin&&<Link href={"/admin?sugerir_titular="+encodeURIComponent(selected.titular_sugerido)}
                className="flat-button">Conferir cadastro</Link>}
            </div>}
            {!selected.duplicada_de&&<>
              <section className="conference-panel conference-edit">
                <h2><ClipboardCheck size={17}/> Confirmar lançamento</h2>
                <form id={formId} action={"/api/propostas/"+selected.id+"/revisar"}
                  method="post" className="review-form">
                  {batch&&<input type="hidden" name="arquivos" value={batch.join(",")}/>}
                  {lote&&<input type="hidden" name="lote" value={lote}/>}
                  <div className="conference-fields">
                    <label>Titular
                      <select name="titularId" defaultValue={needsOwner?"":selected.titular_id} required>
                        <option value="">Selecione o titular</option>
                        {books.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
                      </select>
                    </label>
                    <ReviewCategoryPicker key={selected.id} cats={cats}
                      selectedId={selected.categoria_id} suggestedName={selected.categoria_sugerida_nome||""}/>
                    <label>Tipo
                      <select name="tipo" defaultValue={selected.tipo==="receita"?"outro":selected.tipo}>
                        <option value="despesa">Despesa</option><option value="outro">Outro</option>
                      </select>
                    </label>
                    <label>Valor
                      <input name="valor" inputMode="decimal" defaultValue={selected.valor||""}/>
                    </label>
                    <label>Data do pagamento
                      <input name="dataPagamento" type="date" defaultValue={selected.data_pagamento||""}/>
                    </label>
                    <label>Competência
                      <input name="competencia" type="month" defaultValue={selected.competencia.slice(0,7)} required/>
                    </label>
                    <label className="conference-field-double">Recebedor / contraparte
                      <input name="contraparte" defaultValue={selected.contraparte}/>
                    </label>
                    <label className="conference-field-double">Descrição do lançamento
                      <textarea name="titulo" required maxLength={170} rows={2} defaultValue={selected.titulo}/>
                    </label>
                    <label>Documento
                      <select name="documentoTipo" defaultValue={selected.documento_tipo}>
                        {Array.from(new Set(["nota fiscal","boleto","comprovante","recibo","tributo","contrato","outro",selected.documento_tipo]))
                          .map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label>Número / referência
                      <input name="referencia" defaultValue={selected.referencia}/>
                    </label>
                  </div>
                  {query.erro==="semelhante"&&query.id===selected.id&&<label className="conference-similar-override">
                    <input type="checkbox" name="confirmarSemelhante" value="1"/>
                    Verifiquei o lançamento existente. Este é outro pagamento e autorizo registrar separadamente.
                  </label>}
                  <TagPicker key={"tags-"+selected.id} tags={tags} selected={selectedTags}/>
                  <details className="conference-extra">
                    <summary>Observações adicionais</summary>
                    <label>Detalhes do documento
                      <textarea name="descricao" rows={2} defaultValue={selected.descricao}/>
                    </label>
                  </details>
                </form>
              </section>
            </>}
            <details className="conference-text">
              <summary><FileText size={15}/> Texto extraído do documento</summary>
              <pre>{selected.texto_extraido.slice(0,30000)}</pre>
            </details>
            <div className="conference-bottom-actions" aria-label="Ações de conferência">
              {!selected.duplicada_de&&<button type="submit" form={formId} name="acao" value="aprovar" className="primary-btn">
                <Save size={15}/> Salvar
              </button>}
              <DiscardDocument propostaId={selected.id} arquivos={batch?.join(",")} lote={lote} compact/>
            </div>
          </>}
        </main>
      </div>
    </div>
  </StandaloneWorkspace>;
}
