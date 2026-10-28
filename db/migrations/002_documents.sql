BEGIN;

CREATE TABLE IF NOT EXISTS categorias (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  subcategoria TEXT NOT NULL DEFAULT '',
  UNIQUE(nome, subcategoria)
);
INSERT INTO categorias (nome, subcategoria) VALUES
  ('Insumos Agrícolas','Fertilizantes'),('Insumos Agrícolas','Sementes'),('Insumos Agrícolas','Defensivos'),
  ('Combustíveis','Diesel'),('Combustíveis','Outros'),
  ('Manutenção','Peças'),('Manutenção','Serviços'),
  ('Pessoal','Salários'),('Pessoal','Encargos'),('Serviços',''),
  ('Outras despesas',''),('Receitas','')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS operacoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titular_id BIGINT NOT NULL REFERENCES titulares(id),
  titulo TEXT NOT NULL,
  competencia DATE NOT NULL,
  categoria_id BIGINT REFERENCES categorias(id),
  tipo TEXT NOT NULL DEFAULT 'despesa' CHECK(tipo IN ('receita','despesa','outro')),
  descricao TEXT NOT NULL DEFAULT '',
  contraparte TEXT NOT NULL DEFAULT '',
  valor NUMERIC(16,2),
  referencia TEXT NOT NULL DEFAULT '',
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por BIGINT NOT NULL REFERENCES users(id),
  alterado_por BIGINT REFERENCES users(id),
  excluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operacoes_org_idx ON operacoes (titular_id, competencia DESC) WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS operacoes_categoria_idx ON operacoes (categoria_id);

CREATE TABLE IF NOT EXISTS arquivos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  chave_r2 TEXT NOT NULL UNIQUE,
  nome_original TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BIGINT NOT NULL,
  titular_envio_id BIGINT NOT NULL REFERENCES titulares(id),
  enviado_por BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK(status IN ('aguardando','processando','pronto','erro')),
  erro TEXT,
  texto_extraido TEXT NOT NULL DEFAULT '',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arquivos_status_idx ON arquivos(status,criado_em);

CREATE TABLE IF NOT EXISTS propostas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  arquivo_id BIGINT NOT NULL REFERENCES arquivos(id),
  titular_id BIGINT NOT NULL REFERENCES titulares(id),
  titulo TEXT NOT NULL,
  documento_tipo TEXT NOT NULL DEFAULT 'outro',
  contraparte TEXT NOT NULL DEFAULT '',
  competencia DATE NOT NULL,
  competencia_estimada BOOLEAN NOT NULL DEFAULT TRUE,
  categoria_id BIGINT REFERENCES categorias(id),
  tipo TEXT NOT NULL DEFAULT 'despesa',
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(16,2),
  referencia TEXT NOT NULL DEFAULT '',
  pagina_inicial INTEGER,
  pagina_final INTEGER,
  operacao_sugerida_id BIGINT REFERENCES operacoes(id),
  revisada_por BIGINT REFERENCES users(id),
  revisada_em TIMESTAMPTZ,
  aprovado_por BIGINT REFERENCES users(id),
  aprovado_em TIMESTAMPTZ,
  operacao_id BIGINT REFERENCES operacoes(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pagina_inicial IS NULL OR pagina_inicial >= 1),
  CHECK (pagina_final IS NULL OR pagina_final >= pagina_inicial)
);
CREATE INDEX IF NOT EXISTS propostas_arquivo_idx ON propostas(arquivo_id);
CREATE INDEX IF NOT EXISTS propostas_pendencias_idx ON propostas(titular_id,aprovado_em);

CREATE TABLE IF NOT EXISTS operacao_arquivos (
  operacao_id BIGINT NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
  proposta_id BIGINT NOT NULL UNIQUE REFERENCES propostas(id),
  arquivo_id BIGINT NOT NULL REFERENCES arquivos(id),
  PRIMARY KEY(operacao_id, proposta_id)
);

CREATE TABLE IF NOT EXISTS historico_operacoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operacao_id BIGINT NOT NULL REFERENCES operacoes(id),
  usuario_id BIGINT NOT NULL REFERENCES users(id),
  acao TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
