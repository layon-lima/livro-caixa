BEGIN;
-- Categorias anteriores ficam arquivadas para preservar os documentos aprovados.
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT TRUE;
DO $category_reset$
BEGIN
  IF (SELECT COUNT(DISTINCT nome) FROM categorias
      WHERE nome IN ('Compras Pessoais','Compras Fazenda','Abastecimento',
        'Manutenção Fazenda','Pagamento de Serviços',
        'Pagamento de Dívidas Fazenda','Pagamento de Dívidas Pessoais')
      AND subcategoria='') < 7 THEN
    UPDATE categorias SET ativa=FALSE;
  END IF;
END $category_reset$;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Compras Pessoais','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Compras Fazenda','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Abastecimento','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Manutenção Fazenda','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Pagamento de Serviços','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Pagamento de Dívidas Fazenda','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
INSERT INTO categorias(nome,subcategoria,ativa) VALUES ('Pagamento de Dívidas Pessoais','',TRUE)
ON CONFLICT(nome,subcategoria) DO UPDATE SET ativa=TRUE;
-- As sugestões/seleções ainda não aprovadas devem passar por nova conferência.
UPDATE propostas p SET categoria_id=NULL,revisada_em=NULL,revisada_por=NULL
WHERE p.aprovado_em IS NULL AND p.categoria_id IS NOT NULL AND
  EXISTS(SELECT 1 FROM categorias c WHERE c.id=p.categoria_id AND NOT c.ativa);
UPDATE propostas SET categoria_sugerida_nome='',categoria_sugerida_subcategoria='',
  revisada_em=NULL,revisada_por=NULL
WHERE aprovado_em IS NULL AND
  (categoria_sugerida_nome<>'' OR categoria_sugerida_subcategoria<>'');
COMMIT;
