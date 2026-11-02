"use client";
import {useState,type FormEvent,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";

export function SafeManualForm({children}:{children:ReactNode}){
  const router=useRouter();
  const [warning,setWarning]=useState<null|{duplicate:"strong"|"similar";message:string;existing?:string|null}>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||warning?.duplicate==="strong")return;
    setBusy(true);setError("");
    try{
      const body=new FormData(event.currentTarget);
      body.set("confirmarSemelhante",warning?.duplicate==="similar"?"1":"0");
      const response=await fetch("/api/operacoes",{
        method:"POST",body,credentials:"same-origin",
        headers:{"Accept":"application/json"}
      });
      const result=await response.json() as {
        href?:string;duplicate?:"strong"|"similar";message?:string;existing?:string|null;
      };
      if(response.status===409&&result.duplicate){
        setWarning({duplicate:result.duplicate,message:result.message||"Possível duplicidade.",
          existing:result.existing});return;
      }
      if(!response.ok||!result.href){setError(result.message||"Não foi possível salvar.");return;}
      router.push(result.href);router.refresh();
    }catch{
      setError("Erro de conexão. Nenhum novo lançamento foi confirmado. Verifique a lista antes de tentar novamente.");
    }finally{setBusy(false);}
  }
  return <form className="review-form" action="/api/operacoes" method="post"
    onSubmit={submit} onChange={()=>{setWarning(null);setError("");}}>
    {children}
    {warning&&<div className={warning.duplicate==="strong"?"form-error":"manual-duplicate-warning"}
      role="alert">
      <strong>{warning.duplicate==="strong"?"Duplicidade bloqueada":"Possível lançamento duplicado"}</strong>
      <p>{warning.message}</p>
      {warning.existing&&<Link href={"/operacoes/"+warning.existing}>Consultar lançamento existente</Link>}
      {warning.duplicate==="similar"&&<p>Se forem dois pagamentos diferentes, você pode confirmar o novo registro.</p>}
    </div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="primary-btn" disabled={busy||warning?.duplicate==="strong"}>
      {busy?"Conferindo duplicidades…":warning?.duplicate==="similar"?"Confirmar novo lançamento":"Salvar lançamento"}
    </button>
  </form>;
}
