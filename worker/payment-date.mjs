// Data da efetivação do pagamento: nunca substituir por vencimento, emissão,
// competência ou data de importação. Somente datas sustentadas pelo documento.
export function normalizePaymentDate(value){
  const v=String(value||"").trim();
  let year,month,day;
  const iso=v.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const br=v.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
  if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
  else if(br){year=Number(br[3]);month=Number(br[2]);day=Number(br[1]);}
  else return "";
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||
     date.getUTCDate()!==day)return "";
  return String(year)+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
export function paymentDateFromText(text,kind){
  const t=String(text||"").slice(0,90000);
  const date="(\\d{2}/\\d{2}/20\\d{2}|20\\d{2}-\\d{2}-\\d{2})";
  const labels=[
    "data\\s+do\\s+(?:pagamento|d[ée]bito|cr[ée]dito|pix|transfer[êe]ncia)",
    "data\\s+da\\s+(?:transa[cç][aã]o|efetiva[cç][aã]o|liquida[cç][aã]o|transfer[êe]ncia)",
    "pagamento\\s+(?:efetuado|realizado|confirmado|processado)\\s+(?:em|no\\s+dia)",
    "(?:pago|quitado|liquidado|efetivado|transferido)\\s+em"
  ];
  for(const label of labels){
    const regex=new RegExp("(?:^|\\n)\\s*(?:"+label+")\\s*[:\\-]?\\s*"+date,"im");
    const match=t.match(regex);
    if(match){
      const valid=normalizePaymentDate(match[1]);
      if(valid)return valid;
    }
  }
  // Comprovante Pix efetivado: data no início do comprovante, antes dos dados.
  if(/comprovante\s+(?:de\s+)?(?:pagamento|transfer[êe]ncia)\s+pix/i.test(t.slice(0,800)) &&
    !/agendado|agendamento|n[aã]o\s+efetivado/i.test(t.slice(0,600))){
    const opening=t.slice(0,500);
    const head=opening.match(new RegExp("^(?:[^\\n]*\\n){0,5}[^\\n]*?"+date,"im"));
    if(head){
      const valid=normalizePaymentDate(head[1]);
      if(valid)return valid;
    }
  }
  return "";
}
export function verifiedPaymentDate(text,kind,candidate){
  const found=paymentDateFromText(text,kind);
  if(!candidate)return found;
  const normalized=normalizePaymentDate(candidate);
  // A IA não pode selecionar vencimento/emissão em vez da efetivação.
  return normalized&&normalized===found?normalized:found;
}
