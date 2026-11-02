// Memória segregada por titular, com dados de propostas aprovadas.
export function normalizeParty(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]/g," ").replace(/\s+/g," ").trim().slice(0,180);
}
export function approvedCategory(rows){
 if(!rows?.length)return "";
 const [top,next]=rows;
 const count=Number(top.aprovacoes)||0;
 if(next&&(count<2||count<2*Number(next.aprovacoes)))return "";
 return top.nome;
}
export async function categoryFromApprovals(db,titularId,party){
 const key=normalizeParty(party);
 if(key.length<4||!Number(titularId))return "";
 const result=await db.query(
 "SELECT c.nome,COUNT(*)::int AS aprovacoes "+
 "FROM classificacoes_aprovadas m JOIN categorias c ON c.id=m.categoria_id "+
 "WHERE m.titular_id=$1 AND m.contraparte_chave=$2 AND c.ativa=TRUE "+
 "GROUP BY c.id,c.nome,c.subcategoria ORDER BY aprovacoes DESC,c.id LIMIT 2",
 [titularId,key]);
 return approvedCategory(result.rows);
}
