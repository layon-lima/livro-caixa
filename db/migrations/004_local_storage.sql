BEGIN;

-- A coluna antiga chave_r2 passa a ser uma chave interna do armazenamento,
-- independente do provedor usado anteriormente.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='arquivos' AND column_name='chave_r2'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='arquivos' AND column_name='chave_armazenamento'
  ) THEN
    ALTER TABLE arquivos RENAME COLUMN chave_r2 TO chave_armazenamento;
  END IF;
END $migration$;

ALTER TABLE arquivos
  ADD COLUMN IF NOT EXISTS armazenamento TEXT NOT NULL DEFAULT 'r2',
  ADD COLUMN IF NOT EXISTS compressao TEXT NOT NULL DEFAULT 'nenhuma',
  ADD COLUMN IF NOT EXISTS bytes_armazenados BIGINT;

-- Registros existentes são mantidos sem alteração: nenhum objeto antigo é apagado.
ALTER TABLE arquivos DROP CONSTRAINT IF EXISTS arquivos_armazenamento_check;
ALTER TABLE arquivos ADD CONSTRAINT arquivos_armazenamento_check
  CHECK (armazenamento IN ('r2','local'));
ALTER TABLE arquivos DROP CONSTRAINT IF EXISTS arquivos_compressao_check;
ALTER TABLE arquivos ADD CONSTRAINT arquivos_compressao_check
  CHECK (compressao IN ('nenhuma','gzip'));
ALTER TABLE arquivos DROP CONSTRAINT IF EXISTS arquivos_bytes_armazenados_check;
ALTER TABLE arquivos ADD CONSTRAINT arquivos_bytes_armazenados_check
  CHECK (bytes_armazenados IS NULL OR bytes_armazenados >= 0);

CREATE INDEX IF NOT EXISTS arquivos_armazenamento_idx ON arquivos(armazenamento);

COMMIT;
