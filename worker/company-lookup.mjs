// Identificação local de partes. Sem HTTP ou consulta pública de CNPJ.
const tidy=(v,n=150)=>String(v||"").trim().replace(/\s+/g," ").slice(0,n);
const normalize=v=>tidy(v,300).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
export function confirmedPixReceiver(text){
  const t=String(text||"").slice(0,65000);
  if(!/comprovante\s+de\s+(?:pagamento|transfer[êe]ncia)\s+pix/i.test(t))return "";
  const block=t.match(/Dados\s+de\s+quem\s+recebeu([\s\S]*?)(?=Dados\s+(?:do\s+pagamento|da\s+transa[cç][aã]o|de\s+quem\s+(?:pagou|fez|enviou))|Autentica[cç][aã]o|$)/i)?.[1]||"";
  const name=block.match(/(?:^|\n)\s*Nome\s*:\s*([^\r\n]+)/i)?.[1]||"";
  const result=tidy(name,150);
  if(result.length<3||/^(institui[cç][aã]o|cielo|cpf|cnpj|banco)\s*:/i.test(result))return "";
  return result;
}
export function candidateNewOwner(text,docKind,registeredNames){
  const t=String(text||"").slice(0,65000);
  let name="";
  if(/comprovante|pix|boleto/i.test(docKind||"")){
    const m=t.match(/Dados de quem (?:fez a transa[cç][aã]o|pagou)([\s\S]*?)(?=Autentica[cç][aã]o|Esta transa[cç][aã]o|$)/i);
    name=m?.[1]?.match(/(?:^|\n)\s*Nome\s*:\s*([^\r\n]+)/i)?.[1]||"";
    if(!name)name=t.match(/(?:^|\n)\s*(?:Nome do pagador|Pagador|Quem pagou)\s*:\s*([^\r\n]+)/i)?.[1]||"";
  }else if(/nota fiscal/i.test(docKind||"")){
    const m=t.match(/DESTINAT[AÁ]RIO\s*\/?\s*REMETENTE([\s\S]{0,900})/i);
    name=m?.[1]?.match(/(?:NOME\s*\/\s*RAZ[AÃ]O SOCIAL|RAZ[AÃ]O SOCIAL|NOME)\s*[:\-]\s*([^\r\n]+)/i)?.[1]||"";
  }
  name=tidy(name,120).replace(/^\W+|\W+$/g,"");
  if(name.length<6||name.length>120||/^(?:CNPJ|CPF|VALOR|BANCO|AG[EÊ]NCIA|INSTITUI[CÇ][AÃ]O)\b/i.test(name))return "";
  const normalized=normalize(name);
  if(registeredNames.some(v=>normalize(v)===normalized))return "";
  return name.toLocaleUpperCase("pt-BR");
}
