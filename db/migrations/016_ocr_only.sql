BEGIN;
-- Interrompeu-se a dependência do modelo. Somente arquivos que estavam
-- esperando o estágio antigo de IA voltam à fila OCR, preservando originais,
-- propostas já conferidas e operações aprovadas.
UPDATE arquivos
SET status='aguardando',progresso_etapa='aguardando',
    progresso_dados=progresso_dados - 'ia_resultado',
    erro=NULL,atualizado_em=now()
WHERE status='processando' AND progresso_etapa='ia'
  AND descartado_em IS NULL;
-- Diagnósticos temporários do modelo não precisam permanecer nos previews.
UPDATE arquivos SET progresso_dados=progresso_dados-'ia_resultado'
WHERE progresso_dados ? 'ia_resultado';
COMMIT;
