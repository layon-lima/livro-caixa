import { StandaloneWorkspace } from "@/components/standalone-workspace";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { categorias, titularesPermitidos, type Proposta } from "@/lib/document-data";
import { ArrowLeft, ClipboardCheck, FileText, ExternalLink, LoaderCircle } from "lucide-react";
import { LiveReview } from "@/components/live-review";
export const dynamic="force-dynamic";
type Queued=Proposta&{nome_titular:string;duplicada_de:string|null;arquivo_original_id:string|null;titular_original_id:string|null};

export default async function Conferencia({searchParams}:{searchParams:Promise<{id?:string;arquivo?:string;arquivos?:string;revisada?:string;aprovados?:string;erro?:string}>}){
  const user=await requireUser();
  const db=getDatabase();
  const [query,books,cats]=await Promise.all([searchParams,titularesPermitidos(user,"approve"),categorias()]);
  const ids=query.arquivos && /^\d+(?:,\d+){0,99}$/.test(query.arquivos)
    ? [...new Set(query.arquivos.split(",").map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0)
    : null;
  const batch=ids?.length?ids:null;
  const queryArgs:(number|number[])[] = user.isAdmin?[]:[user.id];
  if(batch) queryArgs.push(batch);
  const rows=await db.query<Queued>(
    "SELECT p.id::text,p.arquivo_id::text,p.titular_id::text,p.titulo,p.documento_tipo,p.contraparte,"+
    "p.competencia::text,p.competencia_estimada,p.categoria_id::text,p.tipo,p.descricao,p.valor::text,p.referencia,"+
    "p.pagina_inicial,p.pagina_final,p.metodo_leitura,p.confianca::text,p.avisos,p.titular_sugerido,p.consulta_empresa,p.revisada_em::text,p.operacao_sugerida_id::text,p.aprovado_em::text,p.duplicada_de::text,"+
    "orig.arquivo_id::text AS arquivo_original_id,orig.titular_id::text AS titular_original_id,"+
    "a.nome_original,a.status,a.erro,a.texto_extraido,t.nome AS nome_titular "+
    "FROM propostas p JOIN arquivos a ON a.id=p.arquivo_id JOIN titulares t ON t.id=p.titular_id "+
    "LEFT JOIN propostas orig ON orig.id=p.duplicada_de "+
    (user.isAdmin?"":"JOIN user_titular_permissions up ON up.titular_id=p.titular_id AND up.user_id=$1 AND up.can_approve=true ")+
    "WHERE p.aprovado_em IS NULL "+
    (batch?"AND p.arquivo_id = ANY($"+queryArgs.length+"::bigint[]) ":"")+
    "ORDER BY p.id DESC LIMIT 500",
    queryArgs);
  const all=rows.rows;
  // Arquivos recém-enviados aparecem imediatamente, ainda sem propostas gravadas.
  const pending=batch?await db.query<{
    id:string;nome_original:string;titular_envio_id:string;nome_titular:string;status:string;
  }>(
    "SELECT a.id::text,a.nome_original,a.titular_envio_id::text,t.nome AS nome_titular,a.status "+
    "FROM arquivos a JOIN titulares t ON t.id=a.titular_envio_id "+
    (user.isAdmin?"":"JOIN user_titular_permissions up ON up.titular_id=a.titular_envio_id "+
      "AND up.user_id=$2 AND up.can_approve=true ")+
    "WHERE a.id=ANY($1::bigint[]) AND a.status IN ('aguardando','processando','erro') "+
    "AND NOT EXISTS (SELECT 1 FROM propostas p WHERE p.arquivo_id=a.id AND p.aprovado_em IS NULL) "+
    "ORDER BY a.id",
    user.isAdmin?[batch]:[batch,user.id]
  ):null;
  const inProgress=pending?.rows||[];
  const requested=all.find(p=>p.id===query.id);
  const activePending=requested?null:
    (query.arquivo?inProgress.find(p=>p.id===query.arquivo):
      (!query.id?inProgress[0]:undefined));
  const selected=requested||(!activePending?
    (query.arquivo?all.find(p=>p.arquivo_id===query.arquivo):undefined)||all[0]:undefined);
  const batchQuery=batch?"arquivos="+batch.join(",")+"&":"";
  const available=selected?await db.query<{id:string;titulo:string}>(
    "SELECT id::text,titulo FROM operacoes WHERE titular_id=$1 AND excluido_em IS NULL ORDER BY id DESC LIMIT 200",
    [selected.titular_id]):null;
  return <StandaloneWorkspace title="Conferência" section="livros"><div className="work-page">
    <header className="work-bar"><Link href="/" className="work-back"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><ClipboardCheck size={16}/> Conferência</strong><Link href="/importar">Importar documentos</Link></header>
    <div className="review-grid">
      <section className="review-list">
        <div className="page-title-compact"><h1>{batch?"Conferência desta importação":"Documentos aguardando aprovação"}</h1><span>{all.length+inProgress.length} documento(s)</span></div>
        {query.erro&&<p className="form-error">Não foi possível concluir: {query.erro}.</p>}
        {query.revisada&&<p className="form-success">Proposta conferida e salva.</p>}
        {query.aprovados&&<p className="form-success">{query.aprovados} proposta(s) aprovada(s).</p>}
        <form method="post" action="/api/propostas/aprovar">
          {batch&&<input type="hidden" name="arquivos" value={batch.join(",")}/>}
          {inProgress.map(p=><div key={"pending-"+p.id} className={"review-row"+(activePending?.id===p.id?" selected":"")}>
            <span className="review-check" aria-hidden="true"><LoaderCircle size={14} className={p.status==="erro"?"":"spin"}/></span>
            <Link href={"/conferencia?"+batchQuery+"arquivo="+p.id} className="review-row-link">
              <span className="review-row-title"><FileText size={14}/><span title={p.nome_original}>{p.nome_original}</span></span>
              <span className="review-row-meta"><span>{p.nome_titular}</span><span>{p.status==="erro"?"Erro":"Analisando…"}</span></span>
            </Link>
          </div>)}
          {all.map(p=><div key={p.id} className={"review-row"+(selected?.id===p.id?" selected":"")}>
            <label className="review-check" title={p.revisada_em?"Selecionar para aprovação":"Confira antes de aprovar"}>
              <input type="checkbox" name="ids" value={p.id} disabled={!p.revisada_em || !!p.duplicada_de}/>
            </label>
            <Link href={"/conferencia?"+batchQuery+"id="+p.id} className="review-row-link">
              <span className="review-row-title"><FileText size={14}/><span title={p.titulo}>{p.titulo}</span></span>
              <span className="review-row-meta">
                <span title={p.nome_titular}>{p.nome_titular}</span>
                <span>{p.duplicada_de?"Duplicado":p.revisada_em?"Conferido":"Pendente"}</span>
              </span>
            </Link>
          </div>)}
          {all.length===0&&inProgress.length===0&&<p className="empty-info">Nenhuma proposta aguardando aprovação.</p>}
          <div className="review-footer">
            <button className="primary-btn" type="submit" disabled={!all.some(p=>p.revisada_em&&!p.duplicada_de)}>Aprovar selecionados</button>
          </div>
        </form>
      </section>
      <section className="review-detail">
        {activePending?<LiveReview key={activePending.id}
          arquivoId={activePending.id} nome={activePending.nome_original}
          titularPadrao={activePending.titular_envio_id} books={books} cats={cats} isAdmin={user.isAdmin}
        />:!selected?<p className="empty-info">{batch?"Nenhuma proposta pendente neste envio.":"Importe um arquivo para começar."}</p>:<>
          <div className="page-title-compact"><h2>{selected.nome_original}</h2>
            <a href={"/api/documentos/"+selected.arquivo_id} target="_blank" rel="noreferrer">Abrir original <ExternalLink size={13}/></a></div>
          <div className="review-analysis-status">
            <strong>{selected.metodo_leitura==="ia"?"Analisado por inteligência artificial":
              selected.metodo_leitura==="xml"?"Dados estruturados do XML":
              selected.consulta_empresa?.status==="confirmado"?"Conferência rápida: OCR validado + consulta de CNPJ":"Leitura automática local (OCR + regras)"}</strong>
            {selected.confianca&&<span>Indicador aproximado de extração: {Math.round(Number(selected.confianca)*100)}%</span>}
            {selected.pagina_inicial&&<span>Páginas: {selected.pagina_inicial}{selected.pagina_final&&selected.pagina_final!==selected.pagina_inicial?"–"+selected.pagina_final:""}</span>}
          </div>
          {selected.duplicada_de && <div className="duplicate-alert">
            <strong>Duplicidade confirmada — proposta #{selected.duplicada_de}</strong>
            <span>Este documento não poderá ser aprovado novamente.</span>
            {selected.arquivo_original_id && (user.isAdmin || selected.titular_original_id===selected.titular_id) &&
              <a href={"/api/documentos/"+selected.arquivo_original_id} target="_blank" rel="noreferrer">Abrir documento original</a>}
          </div>}
          {!selected.duplicada_de && <form action={"/api/propostas/"+selected.id+"/revisar"} method="post" className="review-form">
            {batch&&<input type="hidden" name="arquivos" value={batch.join(",")}/>}
            <section className="review-auto-summary">
              <div><span>Documento</span><strong>{selected.documento_tipo}</strong></div>
              <div><span>Titular</span><strong>{selected.nome_titular}</strong></div>
              <div><span>Categoria</span><strong>{cats.find(c=>c.id===selected.categoria_id)?.nome||"Não identificada"}</strong></div>
              <div><span>Competência</span><strong>{selected.competencia.slice(0,7)}</strong></div>
              <div><span>Valor</span><strong>{selected.valor?Number(selected.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"Não identificado"}</strong></div>
              <div><span>Contraparte</span><strong>{selected.contraparte||"Não identificada"}</strong></div>
              {selected.operacao_sugerida_id&&<div><span>Vinculação</span><strong>Operação relacionada #{selected.operacao_sugerida_id}</strong></div>}
            </section>
            {(selected.titular_sugerido||selected.contraparte)&&<section className="review-enrichment">
              {selected.titular_sugerido&&<div className="enrichment-line">
                <strong>Possível novo titular</strong>
                <span>{selected.titular_sugerido}</span>
                <small>O documento cita essa pessoa como possível responsável. O sistema não cria titulares automaticamente.</small>
                {user.isAdmin?
                  <Link href={"/admin?sugerir_titular="+encodeURIComponent(selected.titular_sugerido)}
                    className="flat-button">Conferir e cadastrar titular</Link>:
                  <small>O cadastro de titulares depende de um administrador.</small>}
              </div>}
              {selected.contraparte&&<div className="enrichment-line">
                <strong>Pesquisa do recebedor / fornecedor</strong>
                {selected.consulta_empresa?.cnpj?<>
                  {selected.consulta_empresa.status==="confirmado"?<small>Consulta CNPJ confirmada</small>:
                    <small>{selected.consulta_empresa.status==="indisponivel"?"BrasilAPI não respondeu à consulta":
                      selected.consulta_empresa.status==="divergente"?"CNPJ não correspondeu ao recebedor":
                      "Consulta CNPJ pendente"}</small>}
                  <span>{selected.consulta_empresa.razao_social||selected.contraparte}
                    {selected.consulta_empresa.nome_fantasia?" ("+selected.consulta_empresa.nome_fantasia+")":""}</span>
                  <small>CNPJ: {selected.consulta_empresa.cnpj}</small>
                  {selected.consulta_empresa.atividade&&<small>Atividade pública (CNAE): {selected.consulta_empresa.atividade}</small>}
                  {selected.consulta_empresa.status==="confirmado"&&<small>Fonte: BrasilAPI. A atividade não comprova o tipo do gasto.</small>}
                </>:<small>Não foi possível confirmar o recebedor por CNPJ; nenhuma informação externa foi utilizada na classificação.</small>}
                <a href={"https://www.google.com/search?q="+encodeURIComponent(selected.contraparte)}
                  target="_blank" rel="noopener noreferrer" className="flat-button">
                  Pesquisar recebedor na internet <ExternalLink size={13}/>
                </a>
              </div>}
            </section>}
            {selected.avisos?.length>0&&<details className="review-notices">
              <summary>{selected.avisos.length} ponto(s) para conferir <span>Ver detalhes</span></summary>
              <ul>{selected.avisos.map((notice,i)=><li key={i}>{notice}</li>)}</ul>
            </details>}
            <details className="review-edit-data" open={(selected.avisos?.length??0)>1}>
              <summary>Corrigir informações sugeridas</summary>
              <div className="review-fields-grid">
                <label className="review-span-all">Título da operação
                  <input name="titulo" defaultValue={selected.titulo} required maxLength={170}/>
                </label>
                <label>Titular
                  <select name="titularId" defaultValue={selected.titular_id} required>
                    {books.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
                  </select>
                </label>
                <label>Categoria
                  <select name="categoriaId" defaultValue={selected.categoria_id||""}>
                    <option value="">Sem categoria</option>
                    {cats.map(c=><option value={c.id} key={c.id}>{c.nome}{c.subcategoria?" → "+c.subcategoria:""}</option>)}
                  </select>
                </label>
                <label>Competência {selected.competencia_estimada&&<em>(estimada)</em>}
                  <input name="competencia" type="month" defaultValue={selected.competencia.slice(0,7)} required/>
                </label>
                <label>Documento
                  <select name="documentoTipo" defaultValue={selected.documento_tipo}>
                    {Array.from(new Set(["nota fiscal","boleto","comprovante","recibo","tributo","contrato","outro",selected.documento_tipo])).map(c=><option key={c}>{c}</option>)}
                  </select>
                </label>
                <label>Tipo
                  <select name="tipo" defaultValue={selected.tipo}>
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
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
                <label className="review-span-half">Vinculação com operação existente
                  <select name="operacaoId" defaultValue={selected.operacao_sugerida_id||""}>
                    <option value="">Criar nova operação</option>
                    {available?.rows.map(o=><option key={o.id} value={o.id}>
                      {o.id===selected.operacao_sugerida_id?"Sugestão: ":""}#{o.id} — {o.titulo}
                    </option>)}
                  </select>
                </label>
              </div>
            {selected.operacao_sugerida_id&&<p className="muted">Foi encontrada uma possível operação relacionada. Confirme a escolha acima antes de salvar.</p>}
            </details>
            <div className="review-approval-actions">
              <button type="submit" name="acao" value="aprovar" className="primary-btn">Aprovar e organizar documento</button>
              <button type="submit" name="acao" value="salvar" className="flat-button">Salvar para depois</button>
            </div>
            <span className="muted">Confira os dados acima antes de aprovar. Nada será organizado definitivamente sem sua confirmação.</span>
          </form>}
          <details className="text-extracted"><summary>Texto extraído do documento</summary><pre>{selected.texto_extraido.slice(0,30000)}</pre></details>
        </>}
      </section>
    </div>
  </div></StandaloneWorkspace>;
}
