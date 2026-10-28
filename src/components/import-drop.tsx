"use client";
import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { FolderUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type UploadResult = {name:string;status:string;id?:string;error?:string};
type WorkerStatus = {id:string;status:"aguardando"|"processando"|"pronto"|"erro";erro:string|null;propostas:number};

const delay = (ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

export function ImportDrop({titularId,canApprove}:{titularId:string;canApprove:boolean}) {
  const router=useRouter();
  const input=useRef<HTMLInputElement>(null);
  const alive=useRef(true);
  const sending=useRef(false);
  const [files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [hover,setHover]=useState(false);
  const [results,setResults]=useState<UploadResult[]>([]);
  const [error,setError]=useState("");
  const [phase,setPhase]=useState<"selecionar"|"enviando"|"lendo"|"concluido">("selecionar");

  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;};
  },[]);

  function accept(data:FileList|File[]) {
    if(busy)return;
    const selected=Array.from(data);
    if(!selected.length)return;
    setFiles(old=>[...old,...selected].slice(0,100));
    setResults([]);setError("");setPhase("enviando");
  }
  function drop(event:DragEvent<HTMLDivElement>) {
    event.preventDefault();setHover(false);
    accept(event.dataTransfer.files);
  }

  async function upload(pending:File[]) {
    if(!pending.length || !titularId || sending.current)return;
    sending.current=true;
    setBusy(true);setPhase("enviando");setError("");setResults([]);
    const all:UploadResult[]=[];
    try {
      for(let i=0;i<pending.length;i+=20) {
        const form=new FormData();
        form.append("titularId",titularId);
        for(const file of pending.slice(i,i+20))form.append("files",file);
        const response=await fetch("/api/importar",{method:"POST",body:form,credentials:"same-origin"});
        const content=await response.json().catch(()=>({error:"Resposta inválida do servidor."}));
        if(!response.ok)throw Error(content.error||"Não foi possível enviar os arquivos.");
        all.push(...(content.results||[]));
        if(alive.current)setResults([...all]);
      }
      if(!alive.current)return;
      setFiles([]);
      router.refresh();
      const ids=[...new Set(all.filter(x=>(x.status==="importado"||x.status==="reprocessado"||x.status==="duplicado") && x.id).map(x=>x.id!))];
      const failed=all.filter(x=>x.status==="erro");
      if(!ids.length) {
        setPhase("concluido");
        setError(failed.length?failed.map(x=>x.name+": "+(x.error||"Falha no envio")).join("; "):
          "Os arquivos já estão cadastrados e não há uma conferência pendente para abrir.");
        return;
      }
      setPhase("lendo");
      // A gravação não é o resultado final: o usuário só vai à conferência
      // depois que o worker publicar os dados extraídos no PostgreSQL.
      for(let attempt=0;alive.current;attempt++){
        const res=await fetch("/api/importar/status?ids="+encodeURIComponent(ids.join(",")),
          {cache:"no-store",credentials:"same-origin"});
        const data=await res.json().catch(()=>({error:"Resposta inválida ao consultar leitura."}));
        if(!res.ok)throw Error(data.error||"Falha ao consultar o processamento.");
        const statuses=data.arquivos as WorkerStatus[];
        if(alive.current){
          setResults(all.map(row=>{
            const current=statuses.find(st=>st.id===row.id);
            if(!current)return row;
            return {...row,status:current.status,
              error:current.status==="erro"?(current.erro||"Falha ao ler o documento"):undefined};
          }));
        }
        const pending=statuses.some(st=>st.status==="aguardando"||st.status==="processando");
        if(!pending) {
          const ready=statuses.filter(st=>st.status==="pronto"&&st.propostas>0).map(st=>st.id);
          if(ready.length) {
            setPhase("concluido");
            if(canApprove) {
              router.push("/conferencia?arquivos="+encodeURIComponent(ready.join(",")));
            } else {
              setError("A leitura foi concluída. Os documentos estão aguardando conferência de um usuário autorizado.");
            }
            return;
          }
          setPhase("concluido");
          setError(statuses.some(st=>st.status==="erro")
            ?"Houve falha na leitura. Confira o erro e use Reprocessar na lista de arquivos."
            :"Não há propostas pendentes destes documentos. Se já foram aprovados, estão organizados no Livro Caixa.");
          return;
        }
        if(attempt>=180){
          setPhase("concluido");
          setError("A leitura ainda está em andamento. Os arquivos continuam sendo processados no servidor; consulte a lista abaixo para acompanhar.");
          return;
        }
        await delay(3000);
      }
    }catch(e) {
      if(alive.current){setFiles([]);setPhase("concluido");setError(e instanceof Error?e.message:"Erro na importação");}
    }finally {
      sending.current=false;
      if(alive.current)setBusy(false);
    }
  }

  useEffect(()=>{
    if(files.length&&!busy)void upload(files);
  },[files,busy]);

  const displayedFiles:UploadResult[]=results.length?results:files.map(f=>({name:f.name,status:"selecionado"}));
  const statusText:Record<string,string>={
    selecionado:"Preparando envio",importado:"Na fila de leitura",
    duplicado:"Já cadastrado",reprocessado:"Nova leitura solicitada",aguardando:"Aguardando OCR",processando:"Lendo e identificando dados…",
    pronto:"Leitura concluída",erro:"Erro",
  };
  return <div className="uploader">
    <div className={"drop-area"+(hover?" drag-active":"")}
      onDragEnter={event=>{event.preventDefault();setHover(true);}}
      onDragOver={event=>event.preventDefault()}
      onDragLeave={event=>{event.preventDefault();setHover(false);}}
      onDrop={drop}
      onClick={()=>{if(!busy)input.current?.click();}}
      role="button" tabIndex={busy?-1:0}
      onKeyDown={event=>{if(!busy&&(event.key==="Enter"||event.key===" "))input.current?.click();}}
      aria-label="Selecionar ou arrastar documentos"
      aria-disabled={busy}>
      <FolderUp size={26}/>
      <strong>Solte aqui para iniciar a leitura</strong>
      <span>PDF, XML, JPG e PNG • até 25 MB por arquivo</span>
      <input ref={input} type="file" accept=".pdf,.xml,.png,.jpg,.jpeg" multiple hidden disabled={busy}
        onChange={(e:ChangeEvent<HTMLInputElement>)=>{if(e.target.files)accept(e.target.files);e.target.value="";}}/>
    </div>
    <div className="upload-actions">
      <strong aria-live="polite">
        {phase==="enviando"?"Enviando arquivos para leitura…":
         phase==="lendo"?"Lendo, identificando e preparando a conferência…":
         files.length+" arquivo(s) selecionado(s)"}
      </strong>
      {busy&&<LoaderCircle size={17} className="spin"/>}
      {!busy&&!files.length&&<span className="muted">Solte o arquivo: envio e leitura automáticos.</span>}
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {(files.length>0||results.length>0)&&<div className="upload-files" aria-live="polite">
      {displayedFiles.map((file,i)=>
        <div className="upload-file-row" key={file.name+i}>
          <span>{file.name}</span>
          <span className={"file-state state-"+file.status}>
            {statusText[file.status]||file.status}{file.error?" — "+file.error:""}
          </span>
        </div>)}
    </div>}
  </div>;
}
