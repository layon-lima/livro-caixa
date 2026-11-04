BEGIN;
-- Etiquetas globais: independentes de categorias e de titulares.
CREATE TABLE IF NOT EXISTS tags (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_nome_normalizado_uniq ON tags (lower(btrim(nome)));
CREATE TABLE IF NOT EXISTS operacao_tags (
  operacao_id BIGINT NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id),
  PRIMARY KEY(operacao_id,tag_id)
);
CREATE INDEX IF NOT EXISTS operacao_tags_tag_idx ON operacao_tags(tag_id,operacao_id);
CREATE TABLE IF NOT EXISTS proposta_tags (
  proposta_id BIGINT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id),
  PRIMARY KEY(proposta_id,tag_id)
);
CREATE INDEX IF NOT EXISTS proposta_tags_tag_idx ON proposta_tags(tag_id,proposta_id);
COMMIT;
