// Reconhecimento determinístico de titulares a partir do OCR e do histórico
// aprovado pelo usuário. Nenhum modelo, API ou serviço externo é consultado.
export function normalizeOwner(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim();
}
export function knownOwnerByName(value,books){
  const key=normalizeOwner(value);
  const parts=key.split(" ").filter(Boolean);
  if(parts.length<2||key.length<8)return null;
  const exact=books.filter(b=>normalizeOwner(b.nome)===key);
  if(exact.length===1)return exact[0];
  if(exact.length>1)return null;
  // Bancos frequentemente cortam o último sobrenome ou abreviam nomes.
  // Só aceitar prefixo completo, com >= 2 palavras e correspondência ÚNICA.
  const prefix=books.filter(b=>normalizeOwner(b.nome).startsWith(key+" "));
  return prefix.length===1?prefix[0]:null;
}
export function ownerMentionedInDocument(text,books){
  const normalized=" "+normalizeOwner(text)+" ";
  const found=books.filter(b=>{
    const name=normalizeOwner(b.nome);
    return name.length>=8&&name.split(" ").length>=2&&normalized.includes(" "+name+" ");
  });
  return found.length===1?found[0]:null;
}
export function ownerFromApprovedPayers(rows,payer,books){
  const key=normalizeOwner(payer);
  if(key.split(" ").length<2||key.length<8)return null;
  const allowed=new Set(books.map(x=>String(x.id)));
  const votes=new Map();
  for(const row of rows||[]){
    if(normalizeOwner(row.pagador_identificado)!==key)continue;
    const id=String(row.titular_id);
    // Considerar TODOS os titulares para detectar homônimos/aliases
    // ambíguos, mesmo que o usuário só veja um dos livros.
    votes.set(id,(votes.get(id)||0)+1);
  }
  // Um comprovante isolado não cria um vínculo automático de identidade.
  const candidates=[...votes].filter(([,count])=>count>=2);
  if(candidates.length!==1||votes.size!==1||!allowed.has(candidates[0][0]))return null;
  return books.find(x=>String(x.id)===candidates[0][0])||null;
}
export async function learnedPixOwner(db,payer,books){
  if(!payer||!books.length)return null;
  const direct=knownOwnerByName(payer,books);
  if(direct)return direct;
  const result=await db.query(
    "SELECT titular_id::text,pagador_identificado FROM propostas "+
    "WHERE aprovado_em IS NOT NULL AND pagador_identificado<>'' "+
    "ORDER BY aprovado_em DESC LIMIT 1500"
  );
  return ownerFromApprovedPayers(result.rows,payer,books);
}
