BEGIN;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS categoria_sugerida_nome TEXT NOT NULL DEFAULT '';
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS categoria_sugerida_subcategoria TEXT NOT NULL DEFAULT '';
COMMIT;
