// Identificadores de documentos são mais confiáveis que valor e recebedor.
// Nunca tratar o número de uma nota, o valor ou o mês isoladamente como chave.
export function normalizeReference(value:string|null|undefined):string{
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g,"");
}
export function normalizeCounterparty(value:string|null|undefined):string{
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
}
export function strongDuplicateKey(documentType:string|null|undefined,reference:string|null|undefined):string|null{
  const raw=String(reference||"").trim();
  const code=normalizeReference(raw);
  const doc=normalizeCounterparty(documentType);
  // EndToEndId Pix: E + ISPB de 8 dígitos + código único do banco.
  if(/^E\d{8}[A-Z0-9]{18,32}$/.test(code) &&
    (!doc||/COMPROVANTE|PIX|OUTRO|TRANSFERENCIA|MANUAL/.test(doc)))return "PIX:"+code;
  const nfe=code.startsWith("NFE")?code.slice(3):code;
  if(/^\d{44}$/.test(nfe) && (/NOTA FISCAL|NFE|NF E|DANFE/.test(doc)||/^NFE/i.test(raw)))
    return "NFE:"+nfe;
  if(/^\d{44}$|^\d{47}$|^\d{48}$/.test(code) && /\bBOLETO\b/.test(doc))
    return "BOLETO:"+code;
  return null;
}
