"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Atualiza a tabela de status sem exigir F5 enquanto o OCR estiver trabalhando.
export function ImportStatusRefresh({active}:{active:boolean}) {
  const router=useRouter();
  useEffect(()=>{
    if(!active)return;
    const id=setInterval(()=>router.refresh(),5000);
    return ()=>clearInterval(id);
  },[active,router]);
  return null;
}
