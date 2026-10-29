"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ExternalLink } from "lucide-react";

type LiveFields={
  titulo?:string;documento_tipo?:string;titular_id?:string;categoria?:string;
  competencia?:string;tipo?:string;valor?:string;contraparte?:string;
  referencia?:string;descricao?:string;titular_sugerido?:string;
  consulta_empresa?:{cnpj?:string;status?:string;razao_social?:string;nome_fantasia?:string;atividade?:string;fonte?:string};
};
type FileState={
  id:string;nome_original:string;status:string;erro:string|null;
  propostas:number;proposta_id:string|null;progresso_etapa:string;progresso_dados:LiveFields;
};
type Book={id:string;nome:string};
type Category={id:string;nome:string;subcategoria:string};
const stages:Record<string,string>={
  aguardando:"Aguardando início da leitura",
  ocr:"Lendo o documento com OCR…",
  ia:"Interpretando com a IA Central…",
  xml:"Interpretando o XML…",
  pronto:"Leitura concluída. Abrindo conferência…",
  erro:"Não foi possível concluir a leitura",
  pesquisando:"Consultando dados públicos do recebedor…"
};
function currency(raw:string|undefined){
  if(!raw)return "Identificando…";
  const value=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):raw;
}

export function LiveReview({arquivoId,nome,titularPadrao,books,cats,isAdmin}:{
  arquivoId:string;nome:string;titularPadrao:string;books:Book[];cats:Category[];isAdmin:boolean;
}){
  const router=useRouter();
  const [fields,setFields]=useState<LiveFields>({});
  const [stage,setStage]=useState("aguardando");
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    let inFlight=false;
    async function refresh(){
      if(!alive||inFlight)return;
      inFlight=true;
      try{
        const res=await fetch("/api/importar/status?ids="+encodeURIComponent(arquivoId),{cache:"no-store"});
        if(!res.ok)throw Error("Não foi possível consultar a leitura.");
        const data=await res.json() as {arquivos:FileState[]};
        const row=data.arquivos.find(x=>x.id===arquivoId);
        if(!row)throw Error("Documento não localizado.");
        if(!alive)return;
        setStage(row.progresso_etapa||row.status);
        setFields(old=>({...old,...(row.progresso_dados||{})}));
        if(row.status==="erro")setError(row.erro||"Falha ao processar o arquivo.");
        else setError("");
        if(row.status==="pronto"){
          if(row.proposta_id&&/^\d+$/.test(row.proposta_id)){
            // Mudar de rota para o registro pronto; refresh() repetido da mesma
            // página pode deixá-la presa em "Abrindo conferência".
            const current=new URL(window.location.href);
            current.searchParams.delete("arquivo");
            current.searchParams.set("id",row.proposta_id);
            router.replace(current.pathname+current.search);
          }else if(row.propostas>0){
            router.refresh();
          }else{
            setError("A leitura terminou, mas não foi criada uma proposta para conferência.");
          }
        }
      }catch(e){
        if(alive)setError(e instanceof Error?e.message:"Falha ao acompanhar o processamento.");
      }finally{inFlight=false;}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),1300);
    return ()=>{alive=false;clearInterval(timer);};
  },[arquivoId,router]);
  const titular=books.find(x=>x.id===fields.titular_id)||
    books.find(x=>x.id===titularPadrao);
  const categoryNames=cats.map(c=>({id:c.id,label:c.nome+(c.subcategoria?" > "+c.subcategoria:"")}));
  const known=categoryNames.find(c=>c.label===fields.categoria);
  const finished=stage==="pronto";
  const stateName=stages[stage]||"Processando o documento…";
  const field=(value:string|undefined)=>value||"";
  return <>
    <div className="page-title-compact">
      <h2>{nome}</h2>
      <a href={"/api/documentos/"+arquivoId} target="_blank" rel="noreferrer">
        Abrir original <ExternalLink size={13}/>
      </a>
    </div>
    <div className="review-analysis-status" role="status" aria-live="polite">
      {!finished&&stage!=="erro"&&<LoaderCircle size={15} className="spin"/>}
      <strong>{stateName}</strong>
      <span>Os campos são preenchidos automaticamente conforme os dados são encontrados.</span>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <section className="review-auto-summary">
      <div><span>Documento</span><strong>{fields.documento_tipo||"Identificando…"}</strong></div>
      <div><span>Titular</span><strong>{titular?.nome||"Identificando…"}{!fields.titular_id?" (provisório)":""}</strong></div>
      <div><span>Categoria</span><strong>{fields.categoria||"Identificando…"}</strong></div>
      <div><span>Competência</span><strong>{fields.competencia||"Identificando…"}</strong></div>
      <div><span>Valor</span><strong>{currency(fields.valor)}</strong></div>
      <div><span>Contraparte</span><strong>{fields.contraparte||"Identificando…"}</strong></div>
    </section>
    {(fields.titular_sugerido||fields.consulta_empresa||fields.contraparte)&&<section className="review-enrichment">
      {fields.titular_sugerido&&<div className="enrichment-line">
        <strong>Possível titular novo</strong><span>{fields.titular_sugerido}</span>
        <small>Cadastro sujeito à conferência. Nenhum livro será criado automaticamente.</small>
        {isAdmin&&<a href={"/admin?sugerir_titular="+encodeURIComponent(fields.titular_sugerido)} className="flat-button">Conferir e cadastrar</a>}
      </div>}
      {fields.consulta_empresa&&<div className="enrichment-line">
        <strong>Consulta pública do recebedor</strong>
        <small>{fields.consulta_empresa.status==="confirmado"?"Consulta confirmada":
          fields.consulta_empresa.status==="identificado_cnpj"?"CNPJ identificado; nome comercial diferente":
          fields.consulta_empresa.status==="indisponivel"?"BrasilAPI indisponível":
          fields.consulta_empresa.status==="divergente"?"Divergência de CNPJ e recebedor":
          "Consultando CNPJ..."}</small>
        <span>{fields.consulta_empresa.razao_social||fields.contraparte}</span>
        <small>CNPJ: {fields.consulta_empresa.cnpj}</small>
        {fields.consulta_empresa.atividade&&<small>CNAE: {fields.consulta_empresa.atividade}</small>}
        {["confirmado","identificado_cnpj"].includes(fields.consulta_empresa.status||"")&&<small>Fonte: BrasilAPI. Sugestão de categoria editável antes de aprovar.</small>}
      </div>}
      {fields.contraparte&&<div className="enrichment-line">
        <a href={"https://www.google.com/search?q="+encodeURIComponent(fields.contraparte)}
          target="_blank" rel="noopener noreferrer" className="flat-button">Pesquisar recebedor na internet <ExternalLink size={13}/></a>
      </div>}
    </section>}
    <div className="review-form review-live-fields">
      <div className="review-fields-grid">
        <label className="review-span-all">Título da operação
          <input value={field(fields.titulo)} placeholder="Identificando…" readOnly/>
        </label>
        <label>Titular
          <select value={titular?.id||""} disabled>
            <option value="">Identificando…</option>
            {books.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        <label>Categoria
          <select value={known?.id||(fields.categoria?"__sugerida__":"")} disabled>
            <option value="">Identificando…</option>
            {fields.categoria&&!known&&<option value="__sugerida__">
              {fields.categoria} (nova sugestão)
            </option>}
            {categoryNames.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label>Competência
          <input type="month" value={field(fields.competencia)} readOnly/>
        </label>
        <label>Documento
          <input value={field(fields.documento_tipo)} placeholder="Identificando…" readOnly/>
        </label>
        <label>Tipo
          <select value={fields.tipo==="receita"?"outro":field(fields.tipo)} disabled>
            <option value="">Identificando…</option>
            <option value="despesa">Despesa</option><option value="outro">Outro</option>
          </select>
        </label>
        <label>Valor
          <input value={field(fields.valor)} placeholder="Identificando…" readOnly/>
        </label>
        <label>Fornecedor / contraparte
          <input value={field(fields.contraparte)} placeholder="Identificando…" readOnly/>
        </label>
        <label>Nº ou referência
          <input value={field(fields.referencia)} placeholder="Identificando…" readOnly/>
        </label>
        <label className="review-span-all">Descrição
          <textarea value={field(fields.descricao)} placeholder="Identificando…" readOnly rows={2}/>
        </label>
      </div>
      <div className="review-approval-actions">
        <button className="primary-btn" disabled type="button">
          {stage!=="erro"&&<LoaderCircle size={14} className="spin"/>}
          {finished?"Abrindo conferência…":"Aprovar e organizar documento"}
        </button>
        <span className="muted">A aprovação será habilitada após a análise e a validação dos dados.</span>
      </div>
    </div>
  </>;
}
