# Implantação planejada na VPS

> Este repositório não executa ações na VPS. A publicação depende de acesso SSH, DNS, rede Docker e credenciais R2. Não sobrescreva os serviços existentes.

## Pré-requisitos

- Docker Engine e Docker Compose na VPS.
- Caddy já ativo e conectado à rede externa `gfarm_proxy`.
- DNS de `livrocaixa.fazendanovohorizonte.com` apontado para a VPS.
- Repositório privado e acesso autorizado do servidor ao GitHub.
- Credenciais de um bucket privado dedicado no Cloudflare R2.

## Preparar os contêineres

```bash
cd /opt/apps
git clone https://github.com/layon-lima/livro-caixa.git livro-caixa
cd /opt/apps/livro-caixa
cp .env.example .env
# Edite .env: defina senha PostgreSQL forte, conta/bucket/chaves do R2.
# Verifique se a rede compartilhada existe:
docker network inspect gfarm_proxy
docker compose up -d --build
```

O banco é exclusivo deste projeto e seu volume é persistente. PostgreSQL não publica porta para o host. A aplicação também não publica porta; Caddy acessa pela rede Docker externa.

## DNS e proxy

Confirme os serviços e redes atuais do Caddy. Acrescente o bloco de `deploy/Caddyfile.snippet` ao Caddyfile existente, sem substituí-lo. Depois valide/recarregue a configuração com o método já usado nessa VPS.

**Atenção:** a definição Docker Compose precisa do alias `livrocaixa-web` na rede externa do serviço `app`. Nunca use `app:3000` no Caddy compartilhado, pois outros projetos também usam o serviço genérico `app`.

## Limites desta etapa

O site exibe apenas a estrutura de navegação vazia; não armazena documentos e ainda não possui login. **Não envie arquivos reais nem disponibilize acesso operacional até a implementação de autenticação e permissões.** As variáveis R2 são lidas somente quando o módulo de armazenamento passar a utilizá-las.

O endpoint `/api/health` confirma que o processo web responde; ele não comprova conexão efetiva com o PostgreSQL ou R2. As verificações dessas integrações serão realizadas quando os módulos correspondentes forem ativados.
