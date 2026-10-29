BEGIN;
-- Data efetiva de pagamento/transferência, distinta de competência e cadastro.
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS data_pagamento DATE;
ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS data_pagamento DATE;
CREATE INDEX IF NOT EXISTS operacoes_data_pagamento_idx
ON operacoes(titular_id,data_pagamento DESC)
WHERE excluido_em IS NULL;
-- Nunca preencher automaticamente a partir de data de criação, vencimento
-- ou emissão: elas não comprovam o pagamento.
COMMIT;
