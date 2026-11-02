BEGIN;
-- Identificador persistente de lote: a aprovação não aguarda o fim do OCR.
CREATE TABLE IF NOT EXISTS lotes_importacao(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 enviado_por BIGINT NOT NULL REFERENCES users(id),
 nome_arquivo TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'recebendo'
   CHECK(status IN ('recebendo','pronto','erro')),
 erro TEXT NOT NULL DEFAULT '',
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lote_itens(
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 lote_id UUID NOT NULL REFERENCES lotes_importacao(id) ON DELETE CASCADE,
 ordem INT NOT NULL,
 nome_entrada TEXT NOT NULL,
 arquivo_id BIGINT REFERENCES arquivos(id),
 status_entrada TEXT NOT NULL,
 erro TEXT NOT NULL DEFAULT '',
 UNIQUE(lote_id,ordem)
);
CREATE INDEX IF NOT EXISTS lote_itens_lote_arquivo_idx ON lote_itens(lote_id,arquivo_id);
CREATE INDEX IF NOT EXISTS lote_itens_arquivo_idx ON lote_itens(arquivo_id) WHERE arquivo_id IS NOT NULL;
COMMIT;
