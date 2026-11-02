"use client";
import {useState} from "react";
import {Trash2} from "lucide-react";
// Confirmação somente para descarte explícito; não altera a aprovação.
export function DiscardDocument({propostaId,arquivoId,arquivos,lote,origem}:{
  propostaId?:string;arquivoId?:string;arquivos?:string;lote?:string;origem?:"importar";
}){
  const [confirm,setConfirm]=useState(false);
  return <div className="discard-document">
    {!confirm?<button type="button" className="flat-button" onClick={()=>setConfirm(true)}>
      <Trash2 size={14}/> Descartar documento
    </button>:<form method="post" action="/api/conferencia/descartar" className="discard-confirm">
      <input type="hidden" name={propostaId?"propostaId":"arquivoId"} value={propostaId||arquivoId||""}/>
      {arquivos&&<input type="hidden" name="arquivos" value={arquivos}/>}
      {lote&&<input type="hidden" name="lote" value={lote}/>}
      {origem&&<input type="hidden" name="origem" value={origem}/>}
      <span>Retirar da fila sem criar lançamento?</span>
      <button type="submit" className="flat-button">Sim, descartar</button>
      <button type="button" className="flat-button" onClick={()=>setConfirm(false)}>Voltar</button>
    </form>}
  </div>;
}
