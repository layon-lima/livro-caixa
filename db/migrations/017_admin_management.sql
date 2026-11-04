BEGIN;
-- Exclusão administrativa não apaga livros, operações e comprovantes antigos.
ALTER TABLE titulares ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS titulares_ativos_nome_idx ON titulares(nome) WHERE ativo=TRUE;
COMMIT;
