BEGIN;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS duplicada_de BIGINT REFERENCES propostas(id);
CREATE INDEX IF NOT EXISTS propostas_referencia_idx ON propostas(documento_tipo,referencia) WHERE referencia<>'';
COMMIT;
