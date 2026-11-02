BEGIN;
-- Somente lançamentos novos recebem uma chave de transação. Histórico preservado.
ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS chave_duplicidade TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS operacoes_chave_duplicidade_ativa_uniq
 ON operacoes(chave_duplicidade)
 WHERE chave_duplicidade IS NOT NULL AND excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS operacoes_similaridade_idx
 ON operacoes(titular_id,data_pagamento,valor,tipo)
 WHERE excluido_em IS NULL AND data_pagamento IS NOT NULL AND valor IS NOT NULL;
-- NUNCA associar uma chave baseada somente em valor, recebedor ou competência.
COMMIT;
