"use client";

import {Suspense,useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight} from "lucide-react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {movePage,ROOT_HISTORY,safeHistory,visitPage,type AppHistory} from "@/lib/app-history";

const KEY="livro-caixa:app-history:v1";
function readHistory():AppHistory{
  try{return safeHistory(JSON.parse(sessionStorage.getItem(KEY)||"null"));}
  catch{return ROOT_HISTORY;}
}
function saveHistory(value:AppHistory){
  try{sessionStorage.setItem(KEY,JSON.stringify(value));}catch{/* navegação funciona sem storage */}
}

function NavigationControls(){
  const router=useRouter();
  const pathname=usePathname();
  const params=useSearchParams();
  const query=params.toString();
  const current=pathname+(query?"?"+query:"");
  const [history,setHistory]=useState<AppHistory>(ROOT_HISTORY);
  const [navigating,setNavigating]=useState(false);
  const fromBrowser=useRef(false);
  const pendingTarget=useRef<string|null>(null);

  useEffect(()=>{
    const onPop=()=>{fromBrowser.current=true;};
    window.addEventListener("popstate",onPop);
    return ()=>window.removeEventListener("popstate",onPop);
  },[]);

  useEffect(()=>{
    const next=visitPage(readHistory(),current,fromBrowser.current);
    fromBrowser.current=false;
    saveHistory(next);
    setHistory(next);
    if(pendingTarget.current===current){
      pendingTarget.current=null;
    }
    setNavigating(false);
  },[current]);

  function go(delta:-1|1){
    if(navigating)return;
    const next=movePage(history,delta);
    if(!next)return;
    const target=next.entries[next.index];
    // A página inicial é o limite: nunca usar router.back() sem controle.
    if(target===current)return;
    pendingTarget.current=target;
    saveHistory(next);
    setHistory(next);
    setNavigating(true);
    router.replace(target,{scroll:false});
  }
  const canBack=history.index>0&&pathname!=="/"&&!navigating;
  const canForward=history.index<history.entries.length-1&&!navigating;
  return <nav className="nav-arrows" aria-label="Navegação do Livro Caixa">
    <button type="button" onClick={()=>go(-1)} disabled={!canBack}
      aria-label="Voltar" title={canBack?"Voltar para a página anterior":"Você está na página inicial"}>
      <ArrowLeft size={18} strokeWidth={1.8}/>
    </button>
    <button type="button" onClick={()=>go(1)} disabled={!canForward}
      aria-label="Avançar" title={canForward?"Avançar para a próxima página":"Sem página à frente"}>
      <ArrowRight size={18} strokeWidth={1.8}/>
    </button>
  </nav>;
}

export function NavigationArrows(){
  return <Suspense fallback={<nav className="nav-arrows" aria-label="Navegação do Livro Caixa">
    <button type="button" disabled aria-label="Voltar"><ArrowLeft size={18} strokeWidth={1.8}/></button>
    <button type="button" disabled aria-label="Avançar"><ArrowRight size={18} strokeWidth={1.8}/></button>
  </nav>}>
    <NavigationControls/>
  </Suspense>;
}
