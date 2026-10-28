BEGIN;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS metodo_leitura TEXT NOT NULL DEFAULT 'local';
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS confianca NUMERIC(4,3);
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS avisos TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE propostas DROP CONSTRAINT IF EXISTS propostas_metodo_leitura_check;
ALTER TABLE propostas ADD CONSTRAINT propostas_metodo_leitura_check CHECK (metodo_leitura IN ('local','ia','xml'));
ALTER TABLE propostas DROP CONSTRAINT IF EXISTS propostas_confianca_check;
ALTER TABLE propostas ADD CONSTRAINT propostas_confianca_check CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 1));
COMMIT;
