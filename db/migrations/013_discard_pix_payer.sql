BEGIN;
ALTER TABLE arquivos ADD COLUMN IF NOT EXISTS descartado_em TIMESTAMPTZ;
ALTER TABLE arquivos ADD COLUMN IF NOT EXISTS descartado_por BIGINT REFERENCES users(id);
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS descartado_em TIMESTAMPTZ;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS descartado_por BIGINT REFERENCES users(id);
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS pagador_identificado TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS propostas_pendentes_visiveis_idx ON propostas(titular_id,id)
 WHERE aprovado_em IS NULL AND descartado_em IS NULL;
COMMIT;
