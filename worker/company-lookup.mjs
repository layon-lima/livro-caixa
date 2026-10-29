// Consulta pública pontual por CNPJ do recebedor, sem enviar texto de documentos
// a terceiros. A atividade (CNAE) não determina por si só a categoria da despesa.
const tidy=(v,n=150)=>String(v||"").trim().replace(/\s+/g," ").slice(0,n);
const normalize=v=>tidy(v,300).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const formatDigits=v=>String(v||"").replace(/\D/g,"");

export function validCnpj(v){
  const s=formatDigits(v);
  if(s.length!==14||/^(\d)\1+$/.test(s))return false;
  const mod=(str,w)=>{const n=11-[...str].reduce((sum,c,i)=>sum+Number(c)*w[i],0)%11;return n>=10?0:n;};
  const first=mod(s.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  const second=mod(s.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return first===Number(s[12])&&second===Number(s[13]);
}
// Em comprovantes bancários, "Instituição" é o processador, NÃO o recebedor.
// Retorna apenas o nome da seção explícita de quem recebeu.
export function confirmedPixReceiver(text){
  const t=String(text||"").slice(0,65000);
  if(!/comprovante\s+de\s+(?:pagamento|transfer[êe]ncia)\s+pix/i.test(t))return "";
  const block=t.match(/Dados\s+de\s+quem\s+recebeu([\s\S]*?)(?=Dados\s+(?:do\s+pagamento|da\s+transa[cç][aã]o|de\s+quem\s+(?:pagou|fez|enviou))|Autentica[cç][aã]o|$)/i)?.[1]||"";
  const name=block.match(/(?:^|\n)\s*Nome\s*:\s*([^\r\n]+)/i)?.[1]||"";
  const result=tidy(name,150);
  if(result.length<3||/^(institui[cç][aã]o|cielo|cpf|cnpj|banco)\s*:/i.test(result))return "";
  return result;
}

export function receiverCnpj(text,party,docKind){
  const t=String(text||"").slice(0,65000);
  const sections=[];
  // Pix: extrai da seção de quem recebeu, nunca da seção de quem fez a transação.
  const pix=t.match(/Dados de quem recebeu([\s\S]*?)(?=Dados (?:do pagamento|da transa[cç][aã]o)|Dados de quem fez|Dados de quem pagou|Autentica[cç][aã]o|$)/i);
  if(pix)sections.push(pix[1]);
  // Boleto e nota: tenta região da contraparte já identificada.
  const p=normalize(party);
  if(p.length>=6){
    const rows=t.split(/\r?\n/);
    for(let i=0;i<rows.length;i++){
      if(normalize(rows[i]).includes(p)){
        sections.push(rows.slice(Math.max(0,i-1),Math.min(rows.length,i+7)).join("\n"));
        break;
      }
    }
  }
  if(!sections.length && /nota fiscal/i.test(docKind||"")){
    const emit=t.match(/(?:EMITENTE|FORNECEDOR)([\s\S]{0,550}?)(?=DESTINAT[AÁ]RIO|PRODUTOS|FATURA|$)/i);
    if(emit)sections.push(emit[1]);
  }
  for(const section of sections){
    const candidates=[...section.matchAll(/(?:CPF\s*\/\s*CNPJ|CNPJ)\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/gi)];
    for(const candidate of candidates){
      const digits=formatDigits(candidate[1]);
      if(validCnpj(digits))return digits;
    }
  }
  return "";
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
export async function lookupPublicCnpj(cnpj){
  if(!validCnpj(cnpj))return null;
  // Host fixo, somente CNPJ validado; nenhum nome, texto OCR ou documento é enviado.
  const url="https://brasilapi.com.br/api/cnpj/v1/"+cnpj;
  const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error("Consulta pública indisponível (HTTP "+response.status+")");
  const data=await response.json();
  if(formatDigits(data.cnpj)!==cnpj)throw Error("CNPJ retornado não corresponde ao consultado.");
  return {
    cnpj,
    razao_social:tidy(data.razao_social,150),
    nome_fantasia:tidy(data.nome_fantasia,150),
    atividade:tidy(data.cnae_fiscal_descricao,220),
    codigo_cnae:String(data.cnae_fiscal||"").slice(0,12),
    fonte:"BrasilAPI (dados públicos da Receita Federal)"
  };
}
