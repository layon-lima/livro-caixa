"use client";
import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { FileUp, FolderUp, LoaderCircle } from "lucide-react";

type ImportResult = { name:string;status:string;id?:string;error?:string };
export function ImportDrop({titularId}:{titularId:string}) {
  const input=useRef<HTMLInputElement>(null);
  const [files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [hover,setHover]=useState(false);
  const [results,setResults]=useState<ImportResult[]>([]);
  const [error,setError]=useState("");
  function accept(data:FileList|File[]){
    const selected=Array.from(data);
    setFiles(old=>[...old,...selected].slice(0,100));
    setResults([]);setError("");
  }
  function drop(event:DragEvent<HTMLDivElement>){
    event.preventDefault();setHover(false);accept(event.dataTransfer.files);
  }
  async function upload() {
    if(!files.length || !titularId)return;
    setBusy(true);setError("");setResults([]);
    const all:ImportResult[]=[];
    try{
      for(let i=0;i<files.length;i+=20) {
        const form=new FormData();
        form.append("titularId",titularId);
        for(const file of files.slice(i,i+20))form.append("files",file);
        const response=await fetch("/api/importar",{method:"POST",body:form,credentials:"same-origin"});
        const content=await response.json().catch(()=>({error:"Resposta inválida do servidor."}));
        if(!response.ok)throw new Error(content.error||"Não foi possível importar.");
        all.push(...(content.results||[]));
        setResults([...all]);
      }
      setFiles([]);
    }catch(e){setError(e instanceof Error?e.message:"Erro no envio");}
    finally{setBusy(false);}
  }
  const displayedFiles: ImportResult[] = results.length
    ? results
    : files.map(f => ({ name: f.name, status: "selecionado" }));
  return <div className="uploader">
    <div className={"drop-area"+(hover?" drag-active":"")}
      onDragEnter={event=>{event.preventDefault();setHover(true);}}
      onDragOver={event=>event.preventDefault()}
      onDragLeave={event=>{event.preventDefault();setHover(false);}}
      onDrop={drop}
      onClick={()=>input.current?.click()}
      role="button" tabIndex={0}
      onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")input.current?.click();}}
      aria-label="Selecionar ou arrastar documentos">
      <FolderUp size={26}/><strong>Arraste arquivos aqui ou clique para selecionar</strong>
      <span>PDF, XML, JPG e PNG • até 25 MB por arquivo • até 100 na seleção</span>
      <input ref={input} type="file" accept=".pdf,.xml,.png,.jpg,.jpeg" multiple
        hidden onChange={(e:ChangeEvent<HTMLInputElement>)=>{if(e.target.files)accept(e.target.files);e.target.value="";}}/>
    </div>
    <div className="upload-actions">
      <strong>{files.length} arquivo(s) selecionado(s)</strong>
      {files.length>0&&<button disabled={busy} type="button" className="flat-button" onClick={()=>setFiles([])}>Limpar</button>}
      <button className="primary-btn" type="button" disabled={busy||!files.length||!titularId} onClick={upload}>
        {busy?<LoaderCircle size={15} className="spin"/>:<FileUp size={15}/>}
        {busy?"Enviando...":"Enviar documentos"}
      </button>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {(files.length>0 || results.length>0)&&<div className="upload-files">
      {displayedFiles.map((f,i)=>
        <div className="upload-file-row" key={f.name+i}><span>{f.name}</span>
          <span className={"file-state state-"+f.status}>{f.status}{f.error?" — "+f.error:""}</span>
        </div>)}
    </div>}
  </div>;
}
