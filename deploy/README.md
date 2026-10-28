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


## Camada 02 — habilitar login e titulares

Na VPS, com os contêineres da Camada 01 já ativos:

1. Atualize o repositório:
   
   git pull --ff-only

2. Aplique a migração SQL (idempotente) antes de iniciar a versão com login:

   docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/001_auth.sql

3. Atualize a aplicação:

   docker compose up -d --build

4. Crie o primeiro administrador com a senha digitada sem eco na tela:

   read -rsp 'Senha do admin (12+ caracteres): ' LC_ADMIN_PASSWORD; echo
   HASH=$(printf '%s' "$LC_ADMIN_PASSWORD" | docker compose exec -T app node scripts/hash-stdin.mjs)
   unset LC_ADMIN_PASSWORD
   if [ -n "$HASH" ]; then
     printf "INSERT INTO users(username,password_hash,is_admin) VALUES('admin','%s',TRUE) ON CONFLICT(username) DO NOTHING;\n" "$HASH" | docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
   fi
   unset HASH

Esse comando não cria uma senha fixa no código ou repositório. O usuário inicial é "admin". Para definir outra senha após a criação, utilize a tela administrativa quando o site estiver acessível.

5. Somente após preparar o login e confirmar DNS/rede/hostname, ative o bloco Caddy. Preserve todos os outros blocos do Caddyfile. Utilize HTTPS.

### Permissões

- Administrador acessa todos os livros e pode criar titulares, usuários, trocar senhas e distribuir permissões.
- Usuário comum vê apenas titulares para os quais recebeu "Consultar".
- Ações "Importar", "Aprovar", "Editar" e "Excluir" são permissões independentes; as APIs de cada função só serão criadas nas camadas correspondentes e deverão validá-las no servidor.
- A ausência de permissão retorna erro ou página indisponível, sem expor os registros de outros titulares.

### Segurança operacional

- Mantenha o repositório privado.
- O PostgreSQL continua isolado e o contêiner web ainda não publica portas próprias.
- Nenhuma credencial real foi incluída neste commit.
- Não interprete o endpoint /api/health como verificação de login ou do banco.
