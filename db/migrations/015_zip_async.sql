BEGIN;
-- Envio rápido: lote permanece "recebendo" até o processo de extração assumir.
ALTER TABLE lotes_importacao ADD COLUMN IF NOT EXISTS titular_envio_id BIGINT REFERENCES titulares(id);
ALTER TABLE lotes_importacao ADD COLUMN IF NOT EXISTS zip_pronto BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lotes_importacao DROP CONSTRAINT IF EXISTS lotes_importacao_status_check;
ALTER TABLE lotes_importacao ADD CONSTRAINT lotes_importacao_status_check
 CHECK(status IN ('recebendo','extraindo','pronto','erro'));
CREATE INDEX IF NOT EXISTS lotes_importacao_zip_pendente_idx
 ON lotes_importacao(status,atualizado_em)
 WHERE titular_envio_id IS NOT NULL AND status IN ('recebendo','extraindo');
COMMIT;
