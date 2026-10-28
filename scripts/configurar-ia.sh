#!/usr/bin/env bash
# Configuração local e privada: a chave nunca passa pelo ChatGPT ou GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "Arquivo .env do Livro Caixa não encontrado."
  exit 1
fi
echo "ATENÇÃO: ativar esta opção envia o TEXTO EXTRAÍDO de documentos para a API OpenAI."
echo "A API pode gerar cobrança separada da assinatura ChatGPT."
read -rp "Você concorda com o envio e a cobrança da API? Digite SIM: " CONSENTIMENTO
if [[ "$CONSENTIMENTO" != "SIM" ]]; then
  echo "Cancelado sem alterar a configuração."
  exit 0
fi
read -rsp "Cole sua chave da API (não será exibida): " CHAVE
echo
if [[ ! "$CHAVE" =~ ^sk-[A-Za-z0-9_-]{20,}$ ]]; then
  echo "Formato de chave não reconhecido. Nenhuma alteração realizada."
  unset CHAVE
  exit 1
fi
umask 077
if grep -q '^OPENAI_API_KEY=' .env; then
  sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$CHAVE|" .env
else
  printf '\nOPENAI_API_KEY=%s\n' "$CHAVE" >> .env
fi
unset CHAVE
chmod 600 .env
docker compose up -d --force-recreate --no-deps app worker
echo "Configuração gravada na VPS. Reimporte ou reprocese um documento não conferido para testar."
