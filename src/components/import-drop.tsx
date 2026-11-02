"use client";
import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { FolderUp, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type UploadResult = {name:string;status:string;id?:string;error?:string;lote?:string};
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
  const [info,setInfo]=useState("");
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
    setResults([]);setError("");setInfo("");setPhase("enviando");
  }
  function drop(event:DragEvent<HTMLDivElement>) {
    event.preventDefault();setHover(false);
    accept(event.dataTransfer.files);
  }

  async function upload(pending:File[]) {
    if(!pending.length || !titularId || sending.current)return;
    sending.current=true;
    setBusy(true);setPhase("enviando");setError("");setInfo("");setResults([]);
    const all:UploadResult[]=[];
    const zipBatches:string[]=[];
    let normalIds:string[]=[];
    try {
      // O backend exige ZIP isolado. Dividir aqui impede que arrastar um ZIP
      // acompanhado de PDFs resulte em "ignorado" sem registrar o lote.
      const zipFiles=pending.filter(f=>f.name.toLowerCase().endsWith(".zip"));
      const documents=pending.filter(f=>!f.name.toLowerCase().endsWith(".zip"));
      const requests:File[][]=[
        ...zipFiles.map(f=>[f]),
        ...Array.from({length:Math.ceil(documents.length/20)},(_,i)=>documents.slice(i*20,(i+1)*20))
      ];
      for(const group of requests){
        const form=new FormData();
        form.append("titularId",titularId);
        for(const file of group)form.append("files",file);
        const response=await fetch("/api/importar",{method:"POST",body:form,credentials:"same-origin"});
        const content=await response.json().catch(()=>({error:
          "O servidor não confirmou a importação. Confira o histórico antes de reenviar."}));
        if(!response.ok)throw Error(content.error||"Não foi possível enviar os arquivos.");
        if(content.lote){
          const batchId=String(content.lote);
          zipBatches.push(batchId);
          all.push({name:group[0]?.name||"ZIP",status:"recebido",lote:batchId});
        }else all.push(...(content.results||[]));
        if(alive.current)setResults([...all]);
      }
      if(!alive.current)return;
      setFiles([]);
      router.refresh();
      normalIds=[...new Set(all.filter(x=>
        ["importado","reprocessado","duplicado"].includes(x.status)&&x.id
      ).map(x=>x.id!))];
      const failed=all.filter(x=>x.status==="erro");
      const approved=all.filter(x=>x.status==="ja_aprovado");
      if(zipBatches.length){
        setPhase("lendo");
        if(canApprove&&zipBatches.length===1&&requests.length===1){
          router.push("/conferencia?lote="+encodeURIComponent(zipBatches[0]));
          return;
        }
        setPhase("concluido");
        setInfo(zipBatches.length===1?
          "ZIP recebido. Use Abrir fila para acompanhar a leitura e a conferência.":
          zipBatches.length+" ZIPs recebidos. Abra a fila de cada lote para conferir conforme forem lidos.");
        return;
      }
      if(!normalIds.length){
        setPhase("concluido");
        setError(approved.length?
          "Este documento já foi aprovado e não será reprocessado. Consulte o lançamento no seu livro.":
          failed.length?failed.map(x=>x.name+": "+(x.error||"Falha no envio")).join("; "):
          "Os arquivos já estão cadastrados e não há uma conferência pendente para abrir.");
        return;
      }
      setPhase("lendo");
      if(canApprove){
        router.push("/conferencia?arquivos="+encodeURIComponent(normalIds.join(",")));
        return;
      }
      for(let attempt=0;alive.current;attempt++){
        const res=await fetch("/api/importar/status?ids="+encodeURIComponent(normalIds.join(",")),
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
        const inProgress=statuses.some(st=>st.status==="aguardando"||st.status==="processando");
        if(!inProgress){
          setPhase("concluido");
          setInfo("Leitura finalizada. Os arquivos estão aguardando conferência de um usuário autorizado.");
          return;
        }
        if(attempt>=180){
          setPhase("concluido");
          setInfo("A leitura continua na VPS. A lista de arquivos atualizará automaticamente.");
          return;
        }
        await delay(3000);
      }
    }catch(e){
      if(alive.current){
        setFiles([]);setPhase("concluido");
        setError(e instanceof Error?e.message:"Erro na importação");
      }
    }finally{
      sending.current=false;
      if(alive.current)setBusy(false);
    }
  }

  useEffect(()=>{
    if(files.length&&!busy)void upload(files);
  },[files,busy]);

  const displayedFiles:UploadResult[]=results.length?results:files.map(f=>({name:f.name,status:"selecionado"}));
  const statusText:Record<string,string>={
    selecionado:"Preparando envio",recebido:"ZIP recebido na VPS",importado:"Na fila de leitura",
    duplicado:"Já cadastrado",ja_aprovado:"Já aprovado",reprocessado:"Nova leitura solicitada",aguardando:"Aguardando OCR",processando:"Lendo e identificando dados…",
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
      <span>PDF, XML, JPG, PNG ou ZIP • ZIP até 80 MB (300 documentos)</span>
      <input ref={input} type="file" accept=".pdf,.xml,.png,.jpg,.jpeg,.zip" multiple hidden disabled={busy}
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
    {info&&<p className="form-success" role="status">{info}</p>}
    {(files.length>0||results.length>0)&&<div className="upload-files" aria-live="polite">
      {displayedFiles.map((file,i)=>
        <div className="upload-file-row" key={file.name+i}>
          <span>{file.name} {file.lote&&canApprove&&<Link href={"/conferencia?lote="+encodeURIComponent(file.lote)} className="flat-button">Abrir fila</Link>}</span>
          <span className={"file-state state-"+file.status}>
            {statusText[file.status]||file.status}{file.error?" — "+file.error:""}
          </span>
        </div>)}
    </div>}
  </div>;
}
