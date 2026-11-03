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

export function confirmedPixPayer(text){
  const raw=String(text||"").slice(0,65000);
  const fold=v=>String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  if(!/\bPIX\b/.test(fold(raw)))return "";
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const valid=value=>{
    const s=tidy(value,120).replace(/^[:\s–-]+/,"");
    if(s.length<6||!/[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(s))return "";
    if(/^(?:CPF|CNPJ|BANCO|INSTITUICAO|AGENCIA|CONTA|CHAVE|VALOR|DATA|PIX)\b/.test(fold(s)))return "";
    if(/\d{3}[.\/-]\d{3}/.test(s))return "";
    return s;
  };
  for(const line of lines){
    const norm=fold(line);
    const m=norm.match(/^(?:NOME\s+(?:DO\s+)?PAGADOR|PAGADOR|QUEM\s+PAGOU|NOME\s+DO\s+REMETENTE|REMETENTE|TITULAR\s+DA\s+CONTA\s+DE\s+ORIGEM|NOME\s+DO\s+TITULAR\s+DA\s+CONTA|CONTA\s+DEBITADA\s+POR|PAGAMENTO\s+REALIZADO\s+POR)\s*[:–-]\s*(.+)$/);
    if(m){const found=valid(line.slice(line.length-m[1].length));if(found)return found;}
  }
  const section=/^(?:DADOS\s+(?:DE\s+)?QUEM\s+(?:FEZ\s+(?:A\s+)?TRANSACAO|PAGOU|ENVIOU)|DADOS\s+DO\s+PAGADOR|DADOS\s+DO\s+REMETENTE|DADOS\s+DO\s+CLIENTE|DADOS\s+DA\s+CONTA\s+DE\s+ORIGEM|QUEM\s+PAGOU|PAGADOR|ORIGEM\s+DA\s+TRANSFERENCIA|DADOS\s+DE\s+ORIGEM|PAGAMENTO\s+REALIZADO\s+POR)\s*:?$/;
  const boundary=/^(?:DADOS\s+(?:DE\s+)?QUEM\s+(?:RECEBEU|PAGOU|FEZ|ENVIOU)|DADOS\s+(?:DA\s+)?TRANSACAO|DADOS\s+DO\s+(?:RECEBEDOR|BENEFICIARIO|PAGAMENTO)|DESTINO|RECEBEDOR|BENEFICIARIO|AUTENTICACAO)\b/;
  for(let i=0;i<lines.length;i++){
    if(!section.test(fold(lines[i])))continue;
    for(let j=i+1;j<Math.min(i+12,lines.length);j++){
      if(boundary.test(fold(lines[j])))break;
      const m=lines[j].match(/^(?:Nome(?:\s+(?:completo|do\s+pagador))?|Titular)\s*[:–-]\s*(.+)$/i);
      if(m){const found=valid(m[1]);if(found)return found;}
      if(/^(?:Nome|Titular)\s*:?$/i.test(lines[j])&&j+1<lines.length){
        const found=valid(lines[j+1]);if(found)return found;
      }
    }
  }
  return "";
}
export function knownPixPayer(payer,books){
  const key=normalize(payer);
  if(!key)return null;
  const matches=books.filter(b=>{
    const full=normalize(b.nome);
    return full===key||(key.split(" ").length>=2&&key.length>=10&&full.startsWith(key+" "));
  });
  return matches.length===1?matches[0]:null;
}

export function candidateNewOwner(text,docKind,registeredNames){
  const t=String(text||"").slice(0,65000);
  let name="";
  if(/comprovante|pix|boleto/i.test(docKind||"")){
    name=confirmedPixPayer(t);
    const m=t.match(/Dados de quem (?:fez a transa[cç][aã]o|pagou)([\s\S]*?)(?=Autentica[cç][aã]o|Esta transa[cç][aã]o|$)/i);
    if(!name)name=m?.[1]?.match(/(?:^|\n)\s*Nome\s*:\s*([^\r\n]+)/i)?.[1]||"";
    if(!name)name=t.match(/(?:^|\n)\s*(?:Nome do pagador|Pagador|Quem pagou)\s*:\s*([^\r\n]+)/i)?.[1]||"";
  }else if(/nota fiscal/i.test(docKind||"")){
    const m=t.match(/DESTINAT[AÁ]RIO\s*\/?\s*REMETENTE([\s\S]{0,900})/i);
    name=m?.[1]?.match(/(?:NOME\s*\/\s*RAZ[AÃ]O SOCIAL|RAZ[AÃ]O SOCIAL|NOME)\s*[:\-]\s*([^\r\n]+)/i)?.[1]||"";
  }
  name=tidy(name,120).replace(/^\W+|\W+$/g,"");
  if(name.length<6||name.length>120||/^(?:CNPJ|CPF|VALOR|BANCO|AG[EÊ]NCIA|INSTITUI[CÇ][AÃ]O)\b/i.test(name))return "";
  const normalized=normalize(name);
  if(registeredNames.some(v=>normalize(v)===normalized||(normalized.split(" ").length>=2&&normalized.length>=10&&normalize(v).startsWith(normalized+" "))))return "";
  return name.toLocaleUpperCase("pt-BR");
}
