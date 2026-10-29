BEGIN;
-- Aprendizado SOMENTE de propostas aprovadas. Sem CNPJ ou conteúdo OCR.
CREATE TABLE IF NOT EXISTS classificacoes_aprovadas (
  proposta_id BIGINT PRIMARY KEY REFERENCES propostas(id) ON DELETE CASCADE,
  titular_id BIGINT NOT NULL REFERENCES titulares(id) ON DELETE CASCADE,
  contraparte_chave TEXT NOT NULL,
  categoria_id BIGINT NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classificacoes_aprovadas_busca_idx
ON classificacoes_aprovadas(titular_id,contraparte_chave,categoria_id);
COMMIT;
