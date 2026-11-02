"use client";
import {ArrowLeft,ArrowRight} from "lucide-react";
import {useRouter} from "next/navigation";

// Histórico de navegação do navegador, preservando filtros e páginas anteriores.
export function NavigationArrows(){
  const router=useRouter();
  return <nav className="nav-arrows" aria-label="Navegação">
    <button type="button" onClick={()=>router.back()} aria-label="Voltar" title="Voltar">
      <ArrowLeft size={18} strokeWidth={1.8}/>
    </button>
    <button type="button" onClick={()=>router.forward()} aria-label="Avançar" title="Avançar">
      <ArrowRight size={18} strokeWidth={1.8}/>
    </button>
  </nav>;
}
