import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { categorias, titularesPermitidos, type Proposta } from "@/lib/document-data";
import { ArrowLeft, ClipboardCheck, FileText, ExternalLink } from "lucide-react";
export const dynamic="force-dynamic";
type Queued=Proposta&{nome_titular:string;duplicada_de:string|null;arquivo_original_id:string|null;titular_original_id:string|null};

export default async function Conferencia({searchParams}:{searchParams:Promise<{id?:string;arquivos?:string;revisada?:string;aprovados?:string;erro?:string}>}){
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
    "p.pagina_inicial,p.pagina_final,p.metodo_leitura,p.confianca::text,p.avisos,p.revisada_em::text,p.operacao_sugerida_id::text,p.aprovado_em::text,p.duplicada_de::text,"+
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
  const selected=all.find(p=>p.id===query.id)||all[0];
  const batchQuery=batch?"arquivos="+batch.join(",")+"&":"";
  const available=selected?await db.query<{id:string;titulo:string}>(
    "SELECT id::text,titulo FROM operacoes WHERE titular_id=$1 AND excluido_em IS NULL ORDER BY id DESC LIMIT 200",
    [selected.titular_id]):null;
  return <div className="work-page">
    <header className="work-bar"><Link href="/" className="work-back"><ArrowLeft size={16}/> Livros Caixa</Link>
      <strong><ClipboardCheck size={16}/> Conferência</strong><Link href="/importar">Importar documentos</Link></header>
    <div className="review-grid">
      <section className="review-list">
        <div className="page-title-compact"><h1>{batch?"Conferência desta importação":"Documentos aguardando aprovação"}</h1><span>{all.length} propostas</span></div>
        {query.erro&&<p className="form-error">Não foi possível concluir: {query.erro}.</p>}
        {query.revisada&&<p className="form-success">Proposta conferida e salva.</p>}
        {query.aprovados&&<p className="form-success">{query.aprovados} proposta(s) aprovada(s).</p>}
        <form method="post" action="/api/propostas/aprovar">
          {batch&&<input type="hidden" name="arquivos" value={batch.join(",")}/>}
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
          {all.length===0&&<p className="empty-info">Nenhuma proposta aguardando aprovação.</p>}
          <div className="review-footer">
            <button className="primary-btn" type="submit" disabled={!all.some(p=>p.revisada_em&&!p.duplicada_de)}>Aprovar selecionados</button>
          </div>
        </form>
      </section>
      <section className="review-detail">
        {!selected?<p className="empty-info">{batch?"Nenhuma proposta pendente neste envio.":"Importe um arquivo para começar."}</p>:<>
          <div className="page-title-compact"><h2>{selected.nome_original}</h2>
            <a href={"/api/documentos/"+selected.arquivo_id} target="_blank" rel="noreferrer">Abrir original <ExternalLink size={13}/></a></div>
          <div className="review-analysis-status">
            <strong>{selected.metodo_leitura==="ia"?"Analisado por inteligência artificial":
              selected.metodo_leitura==="xml"?"Dados estruturados do XML":"Leitura automática local (OCR + regras)"}</strong>
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
  </div>;
}
