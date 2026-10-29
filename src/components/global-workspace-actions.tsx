"use client";

import { useEffect,useRef,useState } from "react";
import { usePathname,useRouter } from "next/navigation";
import { ClipboardCheck, FileUp, LoaderCircle, Plus, X } from "lucide-react";

type Book={id:string;nome:string};
type Context={importBooks:Book[];editBooks:Book[];approveBooks:Book[]};
type UploadResult={name:string;status:string;id?:string;error?:string;titular_nome?:string};
type Pending={count:number;href:string};
const accepted=new Set(["pdf","xml","png","jpg","jpeg"]);

export function GlobalWorkspaceActions(){
  const pathname=usePathname();
  const router=useRouter();
  const [context,setContext]=useState<Context|null>(null);
  const [dragging,setDragging]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState("");
  const [existing,setExisting]=useState<{id:string;name:string;owner:string}|null>(null);
  const [pending,setPending]=useState<Pending>({count:0,href:""});
  const busy=useRef(false);
  const nested=useRef(0);

  useEffect(()=>{
    let alive=true;
    fetch("/api/workspace/context",{credentials:"same-origin",cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then((data:Context|null)=>{if(alive)setContext(data);})
      .catch(()=>{if(alive)setContext(null);});
    return ()=>{alive=false;};
  },[pathname?.startsWith("/login")]);

  useEffect(()=>{
    if(!context?.approveBooks.length)return;
    let alive=true;
    const refresh=async()=>{
      try{
        const r=await fetch("/api/importar/pendentes",{cache:"no-store"});
        if(!r.ok)return;
        const data=await r.json() as Pending;
        if(alive)setPending(data);
      }catch{}
    };
    void refresh();
    const interval=setInterval(()=>void refresh(),10000);
    return ()=>{alive=false;clearInterval(interval);};
  },[context,pathname]);

  async function upload(list:File[]){
    if(busy.current||!context?.importBooks.length)return;
    busy.current=true;setUploading(true);setMessage("");setExisting(null);
    const results:UploadResult[]=[];
    try{
      if(list.length>100)throw Error("Envie até 100 arquivos por lote.");
      for(let i=0;i<list.length;i+=20){
        const form=new FormData();
        for(const file of list.slice(i,i+20)){
          const ext=file.name.split(".").pop()?.toLowerCase();
          if(!ext||!accepted.has(ext))throw Error("Formato não suportado: "+file.name);
          form.append("files",file);
        }
        // Sem titularId: o backend usa vínculo técnico até IA/OCR identificar.
        const response=await fetch("/api/importar",{
          method:"POST",body:form,credentials:"same-origin"
        });
        const body=await response.json().catch(()=>({error:"Resposta inválida do servidor."}));
        if(!response.ok)throw Error(body.error||"Falha ao importar.");
        results.push(...(body.results||[]));
      }
      const ids=[...new Set(results.filter(x=>x.id&&
        ["importado","reprocessado","duplicado","outro_titular"].includes(x.status))
        .map(x=>x.id!))];
      const existingFile=results.find(x=>x.status==="outro_titular"&&x.id);
      const approved=results.find(x=>["ja_aprovado","aprovado_outro_titular"].includes(x.status));
      const restricted=results.some(x=>x.status==="duplicado_restrito");
      if(!ids.length){
        throw Error(approved?
          "Este documento já foi aprovado"+(approved.titular_nome?" em "+approved.titular_nome:"")+
            ". Não será lançado novamente.":
          restricted?"Este documento pertence a um livro sem sua permissão de conferência.":
          results.filter(x=>x.error).map(x=>x.name+": "+x.error).join("; ")||
            "Este arquivo não pode ser aberto para conferência.");
      }
      const first=ids[0];
      if(existingFile)setExisting({
        id:existingFile.id!,name:existingFile.name,owner:existingFile.titular_nome||"outro livro"
      });
      setMessage("");
      // Sem popup intermediário: chega diretamente ao formulário da IA.
      if(context.approveBooks.length){
        router.push("/conferencia?arquivos="+encodeURIComponent(ids.join(","))+
          "&arquivo="+encodeURIComponent(first));
      }else{
        setMessage("Documentos recebidos. A conferência exige permissão de aprovação.");
        router.push("/importar");
      }
    }catch(e){
      setMessage(e instanceof Error?e.message:"Erro durante a importação.");
    }finally{
      busy.current=false;setUploading(false);
    }
  }

  useEffect(()=>{
    if(!context?.importBooks.length)return;
    const hasFiles=(e:globalThis.DragEvent)=>
      Boolean(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes("Files"));
    const enter=(e:globalThis.DragEvent)=>{
      if(!hasFiles(e))return;
      e.preventDefault();nested.current++;setDragging(true);
    };
    const over=(e:globalThis.DragEvent)=>{
      if(!hasFiles(e))return;
      e.preventDefault();
      if(e.dataTransfer)e.dataTransfer.dropEffect="copy";
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
      if(list.length)void upload(list);
    };
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
  },[context]);

  if(!context)return null;
  const currentBook=pathname?.match(/^\/livros\/(\d+)(?:\/|$)/)?.[1];
  const fabBook=context.editBooks.find(x=>x.id===currentBook)||
    (context.editBooks.length===1?context.editBooks[0]:null);
  const manual=context.editBooks.length>0&&!(pathname||"").startsWith("/manual");
  return <>
    {manual&&<button type="button" className="global-manual-fab"
      title="Novo lançamento manual" aria-label="Novo lançamento manual"
      onClick={()=>router.push("/manual"+(fabBook?"?titular="+fabBook.id:""))}>
      <Plus size={24} strokeWidth={2.5}/>
    </button>}
    {pending.count>0&&<button type="button" className="global-review-return"
      onClick={()=>router.push(pending.href||"/conferencia")}>
      <ClipboardCheck size={15}/> Conferências pendentes ({pending.count})
    </button>}
    {dragging&&<div className="global-drag-highlight" aria-hidden="true">
      <FileUp size={38}/><strong>Solte para analisar</strong>
      <span>Importação automática, sem escolher titular antes da IA.</span>
    </div>}
    {(uploading||message)&&<div className="global-upload-toast" role="status">
      {uploading?<LoaderCircle size={16} className="spin"/>:<FileUp size={16}/>}
      <span>{uploading?"Enviando documento, abrindo conferência…":message}</span>
      {!uploading&&<button type="button" aria-label="Fechar aviso" onClick={()=>setMessage("")}>
        <X size={15}/>
      </button>}
    </div>}
  </>;
}