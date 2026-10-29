// A IA revisa e preenche lacunas; não sobrescreve evidências do OCR.
const value=v=>String(v??"").trim();
export function mergeOcrReview(ocrItems,aiItems,{protectedPixReceiver=""}={}){
 if(!Array.isArray(aiItems)||!aiItems.length)return ocrItems;
 if(ocrItems.length!==aiItems.length)return aiItems; // Divisão em páginas já validada.
 return aiItems.map((ai,i)=>{
  const ocr=ocrItems[i];
  const out={...ai,...ocr,avisos:[...new Set([...(ocr.avisos||[]),...(ai.avisos||[])])]};
  for(const k of ["titulo","documento_tipo","contraparte","competencia",
    "data_pagamento","categoria","tipo","descricao","valor","referencia",
    "titular_id","titular_sugerido","emitente_nome","destinatario_nome"]){
    if(!value(ocr[k])||value(ocr[k])==="outro")out[k]=ai[k]||ocr[k];
  }
  if(value(ai.descricao)&&!value(ocr.descricao).includes(value(ai.descricao)))
    out.descricao=ai.descricao;
  if(value(ai.titulo)&&!protectedPixReceiver)out.titulo=ai.titulo;
  for(const field of ["contraparte","valor","referencia","competencia"]){
    if(value(ocr[field])&&value(ai[field])&&value(ocr[field])!==value(ai[field]))
      out.avisos.push("OCR e IA divergiram em "+field+"; confirme o campo.");
  }
  if(protectedPixReceiver&&ocrItems.length===1){
    out.contraparte=protectedPixReceiver;
    out.titulo="Comprovante Pix — "+protectedPixReceiver;
  }
  out.pagina_inicial=ocr.pagina_inicial;
  out.pagina_final=ocr.pagina_final;
  return out;
 });
}
