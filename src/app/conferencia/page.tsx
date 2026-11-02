import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { categorias, titularesPermitidos, type Proposta } from "@/lib/document-data";
import { ArrowLeft, ClipboardCheck, FileText, ExternalLink, LoaderCircle } from "lucide-react";
import { LiveReview } from "@/components/live-review";
import { ReviewCategoryPicker } from "@/components/review-category-picker";
import { suggestDocumentName } from "@/lib/document-name";
import { BatchQueueRefresh } from "@/components/batch-queue-refresh";
import { DiscardDocument } from "@/components/discard-document";
import { notFound } from "next/navigation";
export const dynamic="force-dynamic";
type Queued=Proposta&{nome_titular:string;duplicada_de:string|null;arquivo_original_id:string|null;titular_original_id:string|null};

export default async function Conferencia({searchParams}:{searchParams:Promise<{id?:string;arquivo?:string;arquivos?:string;lote?:string;revisada?:string;aprovados?:string;descartado?:string;erro?:string}>}){
  const user=await requireUser();
  const db=getDatabase();
  const [query,books,cats]=await Promise.all([searchParams,titularesPermitidos(user,"approve"),categorias()]);
  const lote=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(query.lote||"")?query.lote!:"";
  const loteInfo=lote?await db.query<{id:string;enviado_por:string;status:string;erro:string;nome_arquivo:string}>(
    "SELECT id::text,enviado_por::text,status,erro,nome_arquivo FROM lotes_importacao WHERE id=$1",[lote]):null;
  const zipBatch=loteInfo?.rows[0];
  if(lote&&(!zipBatch||(!user.isAdmin&&String(user.id)!==zipBatch.enviado_por)))notFound();
  const batchStats=zipBatch?await db.query<{
    total:number;prontos:number;aprovados:number;aguardando:number;processando:number;falhas:number;descartados:number;
  }>(
    "SELECT COUNT(*)::int AS total,"+
    "COUNT(*) FILTER (WHERE a.descartado_em IS NULL AND a.status='pronto' AND EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NULL AND p.descartado_em IS NULL))::int AS prontos,"+
    "COUNT(*) FILTER (WHERE a.id IS NOT NULL AND EXISTS(SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NOT NULL))::int AS aprovados,"+
    "COUNT(*) FILTER (WHERE a.status='aguardando' AND a.descartado_em IS NULL)::int AS aguardando,"+
    "COUNT(*) FILTER (WHERE a.status='processando' AND a.descartado_em IS NULL)::int AS processando,"+
    "COUNT(*) FILTER (WHERE (a.status='erro' AND a.descartado_em IS NULL) OR (li.arquivo_id IS NULL AND li.status_entrada<>'descartado'))::int AS falhas,"+
    "COUNT(*) FILTER (WHERE a.descartado_em IS NOT NULL OR li.status_entrada='descartado')::int AS descartados "+
    "FROM lote_itens li LEFT JOIN arquivos a ON a.id=li.arquivo_id WHERE li.lote_id=$1",
    [lote]
  ):null;
  const stats=batchStats?.rows[0];
  const skipped=zipBatch?await db.query<{nome_entrada:string;erro:string;status_entrada:string}>(
    "SELECT nome_entrada,erro,status_entrada FROM lote_itens "+
    "WHERE lote_id=$1 AND arquivo_id IS NULL ORDER BY ordem LIMIT 40",[lote]
  ):null;
  const ids=query.arquivos && /^\d+(?:,\d+){0,99}$/.test(query.arquivos)
    ? [...new Set(query.arquivos.split(",").map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0)
    : null;
  const batch=ids?.length?ids:null;
  const queryArgs:(number|string|number[])[] = user.isAdmin?[]:[user.id];
  if(lote)queryArgs.push(lote);
  else if(batch)queryArgs.push(batch);
  const scope=lote?"AND EXISTS(SELECT 1 FROM lote_itens li WHERE li.lote_id=$"+queryArgs.length+
    " AND li.arquivo_id=p.arquivo_id) ":
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
  const pending=await db.query<{
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
  const selectedCat=selected?cats.find(c=>c.id===selected.categoria_id):null;
  const selectedName=selected?suggestDocumentName({
    originalName:selected.nome_original,documentType:selected.documento_tipo,
    title:selected.titulo,counterparty:selected.contraparte,description:selected.descricao,
    category:selectedCat?.nome||selected.categoria_sugerida_nome,
    paymentDate:selected.data_pagamento
  }):"";
  const batchQuery=lote?"lote="+encodeURIComponent(lote)+"&":batch?"arquivos="+batch.join(",")+"&":"";

  return <StandaloneWorkspace title="Conferência" section="livros"><div className="work-page">
    <header className="work-bar"><Link href="/" className="work-back"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><ClipboardCheck size={16}/> Conferência</strong><Link href="/importar">Importar documentos</Link></header>
    <div className="review-grid">
      <section className="review-list">
        <div className="page-title-compact"><h1>{lote?"Fila do ZIP":batch?"Conferência desta importação":"Documentos aguardando aprovação"}</h1><span>{all.length+inProgress.length} documento(s)</span></div>
        {lote&&stats&&<div className="batch-queue-summary">
          <strong title={zipBatch?.nome_arquivo}>Lote ZIP: {zipBatch?.nome_arquivo}</strong>
          <span>{stats.prontos} disponíveis para conferir · {stats.aprovados} aprovados</span>
          <span>{stats.processando} em leitura · {stats.aguardando} aguardando · {stats.falhas} com erro/ignorados · {stats.descartados} descartados</span>
          <small>{stats.total} itens recebidos. A leitura continua enquanto você confere.</small>
          {zipBatch?.status==="erro"&&<small className="form-error">{zipBatch.erro}</small>}
          {Boolean(skipped?.rows.length)&&<details className="batch-queue-ignored">
            <summary>Ver arquivos ignorados ({skipped?.rows.length}{stats&&stats.falhas>40?"+":""})</summary>
            {skipped?.rows.map((x,i)=><small key={i}>{x.nome_entrada}: {x.erro||"Já cadastrado ou sem acesso à conferência."}</small>)}
          </details>}
          <BatchQueueRefresh active={stats.aguardando>0||stats.processando>0}/>
        </div>}
        {query.erro&&<p className="form-error">Não foi possível concluir: {query.erro}.</p>}
        {query.descartado&&<p className="form-success">Documento retirado da fila sem criar lançamento.</p>}
        {query.revisada&&<p className="form-success">Documento conferido e salvo.</p>}
        {query.aprovados&&<p className="form-success">{query.aprovados} lançamento(s) criado(s).</p>}
        <form method="post" action="/api/propostas/aprovar">
          {batch&&<input type="hidden" name="arquivos" value={batch.join(",")}/>}
          {lote&&<input type="hidden" name="lote" value={lote}/>}
          {all.map(p=><div key={p.id} className={"review-row"+(selected?.id===p.id?" selected":"")}>
            <label className="review-check" title={p.revisada_em?"Selecionar para aprovação":"Confira antes de aprovar"}>
              <input type="checkbox" name="ids" value={p.id} disabled={!p.revisada_em || !!p.duplicada_de}/>
            </label>
            <Link href={"/conferencia?"+batchQuery+"id="+p.id} className="review-row-link">
              <span className="review-row-title"><FileText size={14}/><span title={p.titulo}>{p.titulo}</span></span>
              <span className="review-row-meta">
                <span title={p.nome_titular}>{p.nome_titular}</span>
                <span>{p.duplicada_de?"Duplicado":p.revisada_em?"Conferido":"Pronto para conferir"}</span>
              </span>
            </Link>
          </div>)}
          {inProgress.map(p=><div key={"pending-"+p.id} className={"review-row"+(activePending?.id===p.id?" selected":"")}>
            <span className="review-check" aria-hidden="true"><LoaderCircle size={14} className={p.status==="erro"?"":"spin"}/></span>
            <Link href={"/conferencia?"+batchQuery+"arquivo="+p.id} className="review-row-link">
              <span className="review-row-title"><FileText size={14}/><span title={p.nome_original}>{p.nome_original}</span></span>
              <span className="review-row-meta"><span>Titular em identificação</span><span>{p.status==="erro"?"Erro na leitura":p.status==="aguardando"?"Na fila":"Analisando…"}</span></span>
            </Link>
          </div>)}
          {all.length===0&&inProgress.length===0&&<p className="empty-info">Nenhum documento aguardando conferência.</p>}
          <div className="review-footer">
            <button className="primary-btn" type="submit" disabled={!all.some(p=>p.revisada_em&&!p.duplicada_de)}>Aprovar selecionados</button>
          </div>
        </form>
      </section>
      <section className="review-detail">
        {activePending?<><LiveReview key={activePending.id}
          arquivoId={activePending.id} nome={activePending.nome_original}
          books={books} cats={cats} isAdmin={user.isAdmin}
        /><DiscardDocument arquivoId={activePending.id} arquivos={batch?.join(",")} lote={lote}/></>:!selected?<p className="empty-info">{lote?"Lote sem documentos pendentes. Os aprovados já estão nos livros.":"Importe um arquivo para começar."}</p>:<>
          <div className="page-title-compact"><h2 title={"Nome no envio: "+selected.nome_original}>{selectedName}</h2>
            <a href={"/api/documentos/"+selected.arquivo_id} target="_blank" rel="noreferrer">Abrir original <ExternalLink size={13}/></a></div>
          <div className="review-analysis-status">
            <strong>{selected.metodo_leitura==="ia"?"Analisado por inteligência artificial":
              selected.metodo_leitura==="xml"?"Dados estruturados do XML":
              "Leitura automática local (OCR + regras)"}</strong>
            {selected.confianca&&<span>Indicador aproximado de extração: {Math.round(Number(selected.confianca)*100)}%</span>}
            {selected.pagina_inicial&&<span>Páginas: {selected.pagina_inicial}{selected.pagina_final&&selected.pagina_final!==selected.pagina_inicial?"–"+selected.pagina_final:""}</span>}
          </div>
          {selected.duplicada_de && <div className="duplicate-alert">
            <strong>Este documento já foi identificado anteriormente</strong>
            <span>Um lançamento duplicado não será criado.</span>
            {selected.arquivo_original_id && (user.isAdmin || selected.titular_original_id===selected.titular_id) &&
              <a href={"/api/documentos/"+selected.arquivo_original_id} target="_blank" rel="noreferrer">Abrir documento original</a>}
          </div>}
          {!selected.duplicada_de && <form action={"/api/propostas/"+selected.id+"/revisar"} method="post" className="review-form">
            {batch&&<input type="hidden" name="arquivos" value={batch.join(",")}/>}
            {lote&&<input type="hidden" name="lote" value={lote}/>}
            <section className="review-auto-summary">
              <div><span>Documento</span><strong>{selected.documento_tipo}</strong></div>
              {selected.pagador_identificado&&<div><span>Quem fez o Pix</span><strong>{selected.pagador_identificado}</strong></div>}
              <div><span>Titular</span><strong>{
                selected.avisos?.some(x=>x.startsWith("Titular não identificado automaticamente")||x.startsWith("Quem fez o Pix")||x.startsWith("Não foi possível ler quem fez o Pix"))?
                "Aguardando sua identificação":selected.nome_titular
              }</strong></div>
              <div><span>Categoria</span><strong>{
                cats.find(c=>c.id===selected.categoria_id)?.nome||
                (selected.categoria_sugerida_nome||"Não identificada")
              }</strong></div>
              <div><span>Competência</span><strong>{selected.competencia.slice(0,7)}</strong></div>
              <div><span>Pagamento</span><strong>{selected.data_pagamento?selected.data_pagamento.split("-").reverse().join("/"):"Não informado"}</strong></div>
              <div><span>Valor</span><strong>{selected.valor?Number(selected.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"Não identificado"}</strong></div>
              <div><span>Contraparte</span><strong>{selected.contraparte||"Não identificada"}</strong></div>
            </section>
            {selected.titular_sugerido&&<section className="review-enrichment">
              {selected.titular_sugerido&&<div className="enrichment-line">
                <strong>Possível novo titular</strong>
                <span>{selected.titular_sugerido}</span>
                <small>O documento cita essa pessoa como possível responsável. O sistema não cria titulares automaticamente.</small>
                {user.isAdmin?
                  <Link href={"/admin?sugerir_titular="+encodeURIComponent(selected.titular_sugerido)}
                    className="flat-button">Conferir e cadastrar titular</Link>:
                  <small>O cadastro de titulares depende de um administrador.</small>}
              </div>}

            </section>}
            {selected.avisos?.length>0&&<details className="review-notices">
              <summary>{selected.avisos.length} ponto(s) para conferir <span>Ver detalhes</span></summary>
              <ul>{selected.avisos.map((notice,i)=><li key={i}>{notice}</li>)}</ul>
            </details>}
            <details className="review-edit-data" open={Boolean(selected.categoria_sugerida_nome)||
              selected.avisos?.some(x=>x.startsWith("Titular não identificado automaticamente")||x.startsWith("Quem fez o Pix")||x.startsWith("Não foi possível ler quem fez o Pix"))||
              (selected.avisos?.length??0)>1}>
              <summary>Corrigir informações sugeridas</summary>
              <div className="review-fields-grid">
                <label className="review-span-all">Descrição do lançamento
                  <input name="titulo" defaultValue={selected.titulo} required maxLength={170}/>
                </label>
                <label>Titular
                  <select name="titularId" defaultValue={
                    selected.avisos?.some(x=>x.startsWith("Titular não identificado automaticamente")||x.startsWith("Quem fez o Pix")||x.startsWith("Não foi possível ler quem fez o Pix"))?
                    "":selected.titular_id
                  } required>
                    <option value="">Selecione o titular do documento</option>
                    {books.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
                  </select>
                </label>
                <ReviewCategoryPicker key={selected.id} cats={cats} selectedId={selected.categoria_id}
                  suggestedName={selected.categoria_sugerida_nome||""}
                  suggestedSubcategory={selected.categoria_sugerida_subcategoria||""}/>
                <label>Competência {selected.competencia_estimada&&<em>(estimada)</em>}
                  <input name="competencia" type="month" defaultValue={selected.competencia.slice(0,7)} required/>
                </label>
                <label>Data do pagamento
                  <input name="dataPagamento" type="date" defaultValue={selected.data_pagamento||""}/>
                  <small>Data da efetivação; deixe vazia se o documento não comprovar o pagamento.</small>
                </label>
                <label>Documento
                  <select name="documentoTipo" defaultValue={selected.documento_tipo}>
                    {Array.from(new Set(["nota fiscal","boleto","comprovante","recibo","tributo","contrato","outro",selected.documento_tipo])).map(c=><option key={c}>{c}</option>)}
                  </select>
                </label>
                <label>Tipo
                  <select name="tipo" defaultValue={selected.tipo==="receita"?"outro":selected.tipo}>
                    <option value="despesa">Despesa</option>
                    
                    <option value="outro">Outro</option>
                  </select>
                </label>
                <label>Valor (informativo)
                  <input name="valor" inputMode="decimal" defaultValue={selected.valor||""}/>
                </label>
                <label>Fornecedor / contraparte
                  <input name="contraparte" defaultValue={selected.contraparte}/>
                </label>
                <label>Nº ou referência
                  <input name="referencia" defaultValue={selected.referencia}/>
                </label>
                <label className="review-span-half">Descrição
                  <textarea name="descricao" defaultValue={selected.descricao} rows={2}/>
                </label>
              </div>
            </details>
            <div className="review-approval-actions">
              <button type="submit" name="acao" value="aprovar" className="primary-btn">Aprovar lançamento</button>
              <button type="submit" name="acao" value="salvar" className="flat-button">Salvar para depois</button>
            </div>
            <span className="muted">Confira os dados acima antes de aprovar. Nada será organizado definitivamente sem sua confirmação.</span>
          </form>}
          <DiscardDocument propostaId={selected.id} arquivos={batch?.join(",")} lote={lote}/>
          <details className="text-extracted"><summary>Texto extraído do documento</summary><pre>{selected.texto_extraido.slice(0,30000)}</pre></details>
        </>}
      </section>
    </div>
  </div></StandaloneWorkspace>;
}
