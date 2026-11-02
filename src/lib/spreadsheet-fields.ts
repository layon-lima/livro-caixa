// Campos compactos da planilha. Não confundir competência com data da transação.
type SpreadsheetDocument = {
  documento_tipo?:string|null;
  titulo?:string|null;
  documento?:string|null;
  tem_documento?:boolean|null;
};

const plain=(value:string|null|undefined)=>
  String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();

export function formatTransactionDate(value:string|null|undefined):string{
  // Nunca usar competência, emissão, vencimento ou data de cadastro como substituta.
  const v=String(value||"");
  const match=v.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if(!match)return "—";
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)
    return "—";
  return match[3]+"/"+match[2]+"/"+match[1];
}

export function documentTypeLabel(doc:SpreadsheetDocument):string{
  if(!doc.tem_documento&&!doc.documento&&
    (!doc.documento_tipo||doc.documento_tipo==="outro"))return "Manual";
  const kind=plain(doc.documento_tipo);
  const clue=plain([doc.titulo,doc.documento].join(" "));
  if(/NOTA FISCAL|NF.E|DANFE/.test(kind))return "NF-e";
  if(/BOLETO/.test(kind))return "Boleto";
  if(/TRIBUTO/.test(kind))return "Tributo";
  if(/RECIBO/.test(kind))return "Recibo";
  if(/CONTRATO/.test(kind))return "Contrato";
  if(/\bPIX\b/.test(clue))return "Pix";
  if(/COMPROVANTE/.test(kind))return "Comprovante";
  if(/NOTA FISCAL|NF.E|DANFE/.test(clue))return "NF-e";
  if(/\bBOLETO\b/.test(clue))return "Boleto";
  return doc.tem_documento||doc.documento?"Documento":"Manual";
}
