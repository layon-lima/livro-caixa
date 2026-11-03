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

// Em comprovantes, o pagador efetivo da conta prevalece sobre o pagador
// cadastrado no boleto e sobre quem recebeu o dinheiro.
const folded=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
export function isPaymentReceipt(text){
  const value=folded(String(text||"").slice(0,20000));
  if(/\b(?:AGENDADO|AGENDAMENTO|PAGAMENTO NAO EFETIVADO|PAGAMENTO CANCELADO)\b/.test(value))return false;
  return /\bCOMPROVANTE\s+(?:DE\s+(?:PAGAMENTO|TRANSFERENCIA)|PIX)\b|\bPIX\s+(?:ENVIADO|REALIZADO|EFETUADO)\b|\bPAGAMENTO (?:EFETUADO|REALIZADO|CONFIRMADO)\b|\bDATA DO DEBITO\b|\bDADOS DE QUEM FEZ O PAGAMENTO\b|\bTRANSACAO REALIZADA\b/.test(value);
}
const explicitSection=/^(?:DADOS\s+(?:DE\s+)?QUEM\s+(?:FEZ\s+(?:O\s+PAGAMENTO|O\s+PIX|A\s+TRANSACAO)|PAGOU|ENVIOU)|QUEM\s+(?:FEZ\s+O\s+PAGAMENTO|PAGOU)|DADOS\s+DO\s+(?:RESPONSAVEL\s+PELO\s+PAGAMENTO|TITULAR\s+DA\s+CONTA\s+DE\s+ORIGEM)|ORIGEM\s+DA\s+TRANSFERENCIA|DADOS\s+DA\s+CONTA\s+DE\s+ORIGEM)\s*:?$/;
const genericSection=/^(?:DADOS\s+DO\s+(?:PAGADOR|REMETENTE|CLIENTE)|PAGADOR|DADOS\s+DE\s+ORIGEM)\s*:?$/;
const forbiddenSection=/\b(?:PAGADOR\s+(?:REGISTRADO|CADASTRADO|INFORMADO)\s+NO\s+BOLETO|DADOS\s+DE\s+QUEM\s+(?:VAI\s+RECEBER|RECEBEU)|BENEFICIARIO|FAVORECIDO)\b/;
const payerLabel=/^(?:NOME\s+(?:DO\s+)?PAGADOR|PAGADOR|QUEM\s+PAGOU|NOME\s+DO\s+REMETENTE|REMETENTE|TITULAR\s+DA\s+CONTA\s+DE\s+ORIGEM|NOME\s+DO\s+TITULAR\s+DA\s+CONTA|CONTA\s+DEBITADA\s+POR|PAGAMENTO\s+REALIZADO\s+POR)\s*[:–-]\s*(.+)$/;
function validPayerName(value){
  const name=tidy(value,120).replace(/^[:\s–-]+/,"");
  if(name.length<6||!/[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(name))return "";
  if(/^(?:CPF|CNPJ|BANCO|INSTITUICAO|AGENCIA|CONTA|CHAVE|VALOR|DATA|PIX|AUTENTICACAO|RAZAO SOCIAL)\b/.test(folded(name)))return "";
  if(/\d{3}[.\/-]\d{3}/.test(name)||/\b(?:R\$|PAGAMENTO|COMPROVANTE)\b/i.test(name))return "";
  return name;
}
function nameAfterHeading(lines,start){
  for(let j=start+1;j<Math.min(start+14,lines.length);j++){
    const key=folded(lines[j]);
    if(/^(?:DADOS\s+(?:DO|DA|DE)\b|AUTENTICACAO\b|RESUMO\b|COMPROVANTE\b)/.test(key))break;
    const match=lines[j].match(/^(?:Nome(?:\s+(?:completo|do\s+pagador|do\s+titular))?|Titular)\s*[:–-]\s*(.+)$/i);
    if(match){const candidate=validPayerName(match[1]);if(candidate)return candidate;}
    if(/^(?:NOME|TITULAR)\s*:?$/i.test(key)&&j+1<lines.length){
      const candidate=validPayerName(lines[j+1]);if(candidate)return candidate;
    }
  }
  return "";
}
export function confirmedPaymentExecutor(text){
  const raw=String(text||"").slice(0,65000);
  if(!isPaymentReceipt(raw))return "";
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const heads=lines.map(folded);
  // Priorizar a seção "quem fez o pagamento" independentemente de sua posição.
  for(let i=0;i<lines.length;i++){
    if(explicitSection.test(heads[i])){
      const name=nameAfterHeading(lines,i);
      if(name)return name;
    }
  }
  // Rótulos diretos, ignorando seções do recebedor ou do pagador apenas
  // cadastrado no boleto. Esses dados não provam quem desembolsou o dinheiro.
  let excluded=false;
  for(let i=0;i<lines.length;i++){
    if(/^(?:DADOS\s+(?:DO|DA|DE)\b|AUTENTICACAO\b)/.test(heads[i]))
      excluded=forbiddenSection.test(heads[i])||
        /^DADOS\s+DO\s+PAGADOR\s+REGISTRADOS?\s+NO\s+BOLETO/.test(heads[i]);
    if(excluded)continue;
    const match=heads[i].match(payerLabel);
    if(match){
      const candidate=validPayerName(lines[i].slice(lines[i].length-match[1].length));
      if(candidate)return candidate;
    }
  }
  for(let i=0;i<lines.length;i++){
    if(genericSection.test(heads[i])){
      const candidate=nameAfterHeading(lines,i);
      if(candidate)return candidate;
    }
  }
  return "";
}
export function confirmedPixPayer(text){
  if(!/\bPIX\b/.test(folded(String(text||"").slice(0,65000))))return "";
  return confirmedPaymentExecutor(text);
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
    name=confirmedPaymentExecutor(t);
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
