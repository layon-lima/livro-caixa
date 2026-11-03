#!/bin/sh
# Retira apenas a IA Central dedicada do servidor, depois de desvincular
# o Livro Caixa. NÃO apaga arquivos, volumes ou serviços de outros apps.
set -eu
CENTRAL=/opt/apps/ia-central
NETWORK=ia_central_net
if [ ! -d "$CENTRAL" ]; then
  echo "IA Central não encontrada em $CENTRAL; nada a remover."
  exit 0
fi
if [ "$(cd "$CENTRAL" && pwd -P)" != "$CENTRAL" ]; then
  echo "Caminho da IA Central inesperado: remoção cancelada." >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker indisponível: remoção cancelada." >&2
  exit 2
fi

# Evita remover uma IA compartilhada, inclusive por apps parados.
for config in /opt/apps/*/compose.yaml /opt/apps/*/compose.yml \
  /opt/apps/*/docker-compose.yml /opt/apps/*/docker-compose.yaml; do
  [ -f "$config" ] || continue
  case "$config" in
    "$CENTRAL"/*|/opt/apps/livro-caixa/*) continue ;;
  esac
  if grep -Eiq 'ia_central_net|OLLAMA_URL|http://ollama:11434|qwen3-vl' "$config"; then
    echo "Outro aplicativo referencia a IA: $config" >&2
    echo "Remoção cancelada para não interromper outro sistema." >&2
    exit 2
  fi
done

if docker network inspect "$NETWORK" >/dev/null 2>&1; then
  attached=$(docker network inspect "$NETWORK" --format '{{range .Containers}}{{println .Name}}{{end}}')
  for ctr in $attached; do
    owner=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$ctr" 2>/dev/null || true)
    if [ "$owner" != "$CENTRAL" ]; then
      echo "O contêiner $ctr usa $NETWORK fora de $CENTRAL." >&2
      echo "Remoção cancelada para preservar outros aplicativos." >&2
      exit 2
    fi
  done
fi

cd "$CENTRAL"
services=$(docker compose config --services)
case " $services " in
  *ollama*) : ;;
  *) echo "Stack sem serviço Ollama identificado. Remoção cancelada." >&2; exit 2 ;;
esac

echo "Removendo a stack IA Central exclusiva e seus volumes de modelos..."
docker compose down --volumes --remove-orphans
# O Docker só remove imagens se não estiverem em uso por outros contêineres.
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^ollama/ollama:' |
while IFS= read -r img; do docker image rm "$img" >/dev/null 2>&1 || true; done
docker network rm "$NETWORK" >/dev/null 2>&1 || true
cd /opt/apps
rm -rf -- "$CENTRAL"
echo "IA Central dedicada removida: contêineres, volumes e diretório."
