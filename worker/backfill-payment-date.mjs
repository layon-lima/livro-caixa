// Backfill conservador. Processa apenas operações sem data de pagamento e
// comprovantes com evidência de efetivação nos textos já extraídos.
import { Pool } from "pg";
import {paymentDateFromText} from "./payment-date.mjs";
const db=new Pool({
  host:process.env.PGHOST,user:process.env.PGUSER,
  password:process.env.PGPASSWORD,database:process.env.PGDATABASE
});
try{
  const rs=await db.query(
    "SELECT o.id::text AS operacao_id,p.id::text AS proposta_id,"+
    "p.documento_tipo,LEFT(a.texto_extraido,12000) AS texto_extraido "+
    "FROM operacoes o JOIN operacao_arquivos oa ON oa.operacao_id=o.id "+
    "JOIN propostas p ON p.id=oa.proposta_id "+
    "JOIN arquivos a ON a.id=oa.arquivo_id "+
    "WHERE o.data_pagamento IS NULL AND o.excluido_em IS NULL "+
    "AND p.aprovado_em IS NOT NULL ORDER BY o.id LIMIT 10000"
  );
  const grouped=new Map();
  for(const row of rs.rows){
    if(!grouped.has(row.operacao_id))grouped.set(row.operacao_id,[]);
    grouped.get(row.operacao_id).push({
      proposal:row.proposta_id,date:paymentDateFromText(row.texto_extraido,row.documento_tipo)
    });
  }
  let updated=0,unverified=0;
  for(const [operation,parts] of grouped){
    const dates=[...new Set(parts.map(x=>x.date).filter(Boolean))];
    if(dates.length!==1){unverified++;continue;}
    const date=dates[0];
    const client=await db.connect();
    try{
      await client.query("BEGIN");
      const u=await client.query(
        "UPDATE operacoes SET data_pagamento=$2,atualizado_em=now() "+
        "WHERE id=$1 AND data_pagamento IS NULL RETURNING id",
        [operation,date]
      );
      if(u.rowCount){
        await client.query(
          "UPDATE propostas SET data_pagamento=$2 WHERE operacao_id=$1 "+
          "AND data_pagamento IS NULL",
          [operation,date]
        );
        updated++;
      }
      await client.query("COMMIT");
    }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
    finally{client.release();}
  }
  console.log(JSON.stringify({backfill:"data_pagamento",updated,withoutProof:unverified,
    checked:grouped.size}));
}catch(e){
  console.error("Falha no backfill de datas de pagamento:",e);
  process.exitCode=1;
}finally{await db.end();}
