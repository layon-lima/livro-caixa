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

   read -rsp 'Senha do admin (6+ caracteres): ' LC_ADMIN_PASSWORD; echo
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


## Camada 03–05 — Fluxo documental operacional

A implantação dessas camadas requer primeiro o bucket privado no Cloudflare R2. Nunca versionar ou compartilhar credenciais no GitHub.

### Configuração do bucket e da interpretação

1. No Cloudflare R2 crie um bucket privado exclusivo para o Livro Caixa, por exemplo "livro-caixa-documentos".
2. Crie credenciais R2 S3 limitadas ao bucket (leitura e escrita de objetos).
3. Edite o arquivo privado /opt/apps/livro-caixa/.env e preencha as variáveis já definidas:
   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.
4. A variável OPENAI_API_KEY é opcional. Sem ela, o OCR local funciona e prepara uma única proposta simples por arquivo; a identificação sofisticada e a separação de documentos distintos num mesmo PDF exigem a IA externa. Use a variável OPENAI_MODEL quando desejar selecionar um modelo compatível.

### Atualização no servidor

Executar em /opt/apps/livro-caixa:

    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/002_documents.sql
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/003_duplicates.sql
    docker compose up -d --build
    docker compose ps

As migrações criam as tabelas sem apagar as credenciais ou os titulares existentes.
Não remover volumes Docker nem executar docker compose down -v.

### Uso

- Importação: arrastar arquivos PDF/XML/JPG/PNG (até 25MB cada); o navegador divide grandes seleções em lotes de 20 arquivos.
- Worker: extração direta do texto PDF/XML, Tesseract para digitalizações e análise opcional por IA externa.
- Conferência: editar e marcar explicitamente cada proposta como conferida; aprovação individual ou múltipla apenas depois.
- Livro: navegar por titular, competência e categoria; buscar nos dados e textos OCR; documentos relacionados sob a mesma operação.
- Manual: usuários autorizados registram operações sem anexos; documentos posteriores podem ser vinculados na conferência.
- Lixeira: exclusão lógica e restauração de operações.

### Limites operacionais e proteção

- O repositório deve ser privado.
- Não inserir documentos reais enquanto as credenciais temporárias do administrador que foram expostas na conversa não forem substituídas.
- O conteúdo enviado à IA externa, quando habilitada, sai da VPS. Utilize apenas provedores compatíveis com sua política de privacidade.
- O OCR é sujeito a erros: nenhuma proposta é aprovada automaticamente.
- Os PDFs originais ficam intactos no bucket privado. A plataforma não cria controles de saldos bancários.
- O endpoint /api/health não verifica R2 ou processamento OCR.
- Se um arquivo falhar na extração, a importação informa o erro e permite solicitar reprocessamento.
- Duplicação comprovada pelo mesmo hash ou identificador robusto de documento é bloqueada; valores iguais isoladamente não são critérios de bloqueio.
