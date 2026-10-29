"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileUp, LoaderCircle, Plus, X } from "lucide-react";
type Book={id:string;nome:string};
type Context={importBooks:Book[];editBooks:Book[];approveBooks:Book[]};
type UploadResult={name:string;status:string;id?:string;error?:string};
const accepted=new Set(["pdf","xml","png","jpg","jpeg"]);

export function GlobalWorkspaceActions(){
  const pathname=usePathname();
  const router=useRouter();
  const [context,setContext]=useState<Context|null>(null);
  const [dragging,setDragging]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [bookId,setBookId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const nested=useRef(0);
  const requestSeq=useRef(0);
  const submitted=useRef(0);
  const [dropRequest,setDropRequest]=useState(0);
  useEffect(()=>{
    let alive=true;
    setContext(null);
    fetch("/api/workspace/context",{credentials:"same-origin",cache:"no-store"})
      .then(r=>r.ok?r.json():null).then((data:Context|null)=>{
        if(!alive)return;
        setContext(data);
      }).catch(()=>{if(alive)setContext(null);});
    return ()=>{alive=false;};
  },[pathname?.startsWith("/login")]);
  const currentBook=pathname?.match(/^\/livros\/(\d+)(?:\/|$)/)?.[1];
  useEffect(()=>{
    if(!context?.importBooks.length)return;
    const preferred=context.importBooks.find(x=>x.id===currentBook)?.id||
      context.importBooks[0].id;
    setBookId(preferred);
  },[context,currentBook]);

  useEffect(()=>{
    if(!context?.importBooks.length||busy||files.length>0)return;
    const hasFiles=(e:globalThis.DragEvent)=>{
      const dt=e.dataTransfer;
      return Boolean(dt && Array.from(dt.types||[]).includes("Files"));
    };
    const enter=(e:globalThis.DragEvent)=>{
      if(!hasFiles(e))return;
      e.preventDefault();
      nested.current++;
      setDragging(true);
    };
    const over=(e:globalThis.DragEvent)=>{
      if(!hasFiles(e))return;
      e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect="copy";
      setDragging(true);
    };
    const leave=(e:globalThis.DragEvent)=>{
      if(!hasFiles(e))return;
      nested.current=Math.max(0,nested.current-1);
      if(!nested.current)setDragging(false);
    };
    const drop=(e:globalThis.DragEvent)=>{
      if(!hasFiles(e))return;
      e.preventDefault();e.stopPropagation();
      nested.current=0;setDragging(false);
      const list=Array.from(e.dataTransfer?.files||[]);
      if(!list.length)return;
      setFiles(list.slice(0,100));
      requestSeq.current+=1;setDropRequest(requestSeq.current);
      setError(list.length>100?"Envie no máximo 100 arquivos por lote.":"");
    };
    // Captura no documento: funciona no explorador, tabelas, cabeçalhos e formulários.
    document.addEventListener("dragenter",enter,true);
    document.addEventListener("dragover",over,true);
    document.addEventListener("dragleave",leave,true);
    document.addEventListener("drop",drop,true);
    return ()=>{
      document.removeEventListener("dragenter",enter,true);
      document.removeEventListener("dragover",over,true);
      document.removeEventListener("dragleave",leave,true);
      document.removeEventListener("drop",drop,true);
    };
  },[context,busy,files.length]);

  const close=()=>{if(!busy){setFiles([]);setError("");}};
  async function send(){
    if(!bookId||!files.length||busy)return;
    setBusy(true);setError("");
    const results:UploadResult[]=[];
    try{
      for(let i=0;i<files.length;i+=20){
        const form=new FormData();
        form.append("titularId",bookId);
        for(const file of files.slice(i,i+20)){
          const ext=file.name.split(".").pop()?.toLowerCase();
          if(!ext||!accepted.has(ext))throw Error("Arquivo não suportado: "+file.name);
          form.append("files",file);
        }
        const response=await fetch("/api/importar",{method:"POST",body:form,credentials:"same-origin"});
        const body=await response.json().catch(()=>({error:"Resposta inválida do servidor."}));
        if(!response.ok)throw Error(body.error||"Falha ao importar documentos.");
        results.push(...(body.results||[]));
      }
      const failures=results.filter(x=>x.status==="erro");
      const ids=[...new Set(results.filter(x=>x.id&&
        ["importado","reprocessado","duplicado"].includes(x.status)).map(x=>x.id!))];
      if(!ids.length)throw Error(failures.map(x=>x.name+": "+(x.error||"Erro")).join("; ")||
        "Não foi possível obter os documentos para conferência.");
      setFiles([]);setError("");
      // Quem só pode importar acompanha o processamento sem acessar dados
      // de conferência para os quais não recebeu permissão.
      const canApprove=context?.approveBooks.some(x=>x.id===bookId);
      // Uma navegação única deixa o Next carregar o estado atualizado.
      // Atualizar a rota antiga no mesmo instante pode interromper a transição
      // para a conferência ao vivo (OCR/IA).
      router.push(canApprove?"/conferencia?arquivos="+encodeURIComponent(ids.join(","))+
        "&arquivo="+encodeURIComponent(ids[0]):
        "/importar?titular="+encodeURIComponent(bookId));
    }catch(e){
      setError(e instanceof Error?e.message:"Falha ao importar.");
    }finally{setBusy(false);}
  }

  // Se há titular permitido, o arquivo começa a ser enviado ao soltar,
  // sem pedir clique em Iniciar leitura. O titular é provisório e pode ser revisto.
  useEffect(()=>{
    if(!dropRequest||submitted.current===dropRequest||!files.length||!bookId)return;
    submitted.current=dropRequest;
    void send();
  },[dropRequest,files,bookId]);

  if(!context)return null;
  const visibleFab=context.editBooks.length>0&&!(pathname||"").startsWith("/manual");
  const fabBook=context.editBooks.find(x=>x.id===currentBook)||
    (context.editBooks.length===1?context.editBooks[0]:null);
  return <>
    {visibleFab&&<button type="button" className="global-manual-fab"
      title="Novo lançamento manual" aria-label="Novo lançamento manual"
      onClick={()=>router.push("/manual"+(fabBook?"?titular="+fabBook.id:""))}>
      <Plus size={24} strokeWidth={2.5}/>
    </button>}
    {dragging&&<div className="global-drag-highlight" aria-hidden="true">
      <FileUp size={38}/><strong>Solte para importar</strong>
      <span>A conferência abrirá automaticamente após o envio.</span>
    </div>}
    {files.length>0&&<div className="global-upload-backdrop" role="presentation">
      <section className="global-upload-dialog" role="dialog" aria-modal="true"
        aria-label="Importar documentos">
        <header>
          <strong><FileUp size={17}/> Importar {files.length} arquivo(s)</strong>
          <button onClick={close} disabled={busy} aria-label="Fechar"><X size={17}/></button>
        </header>
        <p>Enviando automaticamente. A conferência abrirá assim que o arquivo estiver salvo; OCR e IA preencherão o formulário.</p>
        <label>Titular provisório
          <select disabled={busy} value={bookId} onChange={e=>setBookId(e.target.value)}>
            <option value="">Selecione o titular</option>
            {context.importBooks.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <div className="global-upload-names">
          {files.map((f,i)=><div key={i}>{f.name}</div>)}
        </div>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <footer>
          <button className="flat-button" onClick={close} disabled={busy}>Cancelar</button>
          <button className="primary-btn" onClick={()=>void send()} disabled={!bookId||busy}>
            {busy&&<LoaderCircle size={15} className="spin"/>}
            {busy?"Enviando…":"Tentar novamente"}
          </button>
        </footer>
      </section>
    </div>}
  </>;
}