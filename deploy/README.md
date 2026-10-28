# Livro Caixa Inteligente — operação na VPS

Aplicação privada: Next.js + PostgreSQL + worker OCR (PDF/XML/imagens), em Docker.
Domínio: https://livrocaixa.fazendanovohorizonte.com
Proxy existente: Caddy compartilhado pela rede Docker gfarm_proxy.
Nunca modificar os contêineres dos outros aplicativos para implantar este projeto.

## Documentos na VPS — política de armazenamento

**Não é necessário Cloudflare R2, Google Drive, Oracle ou outro serviço externo.**

- Originais: volume persistente Docker "livro-caixa_documents_data", montado somente nos contêineres app (escrita) e worker (leitura).
- Caminho interno do volume: /data/livro-caixa-arquivos.
- Todos os arquivos são gravados com gzip SEM PERDA (gzip nível 6). A abertura descompacta em memória para devolver os bytes exatos do original.
- Cota dos originais compactados: **20.000.000.000 bytes (20 GB decimais)**. A aplicação verifica o tamanho real dos arquivos do volume, inclusive arquivos órfãos, antes de cada gravação.
- Uploads simultâneos são serializados por lock transacional no PostgreSQL, evitando ultrapassar a cota da aplicação.
- O sistema preserva adicionalmente pelo menos 2 GB de espaço livre no filesystem da VPS para proteger os demais serviços.
- Quando atingir a cota, novos documentos são rejeitados com mensagem clara. Documentos existentes permanecem intactos.
- PDFs e JPEGs já são compactados internamente; armazená-los com gzip pode reduzir muito pouco ou até aumentar ligeiramente seu tamanho. A compressão é sempre sem perda.
- A cota de 20 GB cobre **somente os arquivos originais compactados** no volume. O banco PostgreSQL, imagens Docker, logs, backups e temporários do OCR ocupam espaço adicional e não podem ser fisicamente limitados pela regra de importação. Para limite total estrito de 20 GB na VPS, é preciso criar quota de filesystem independente.
- Não usar "docker compose down -v" nem "docker volume prune" no projeto.
- A lixeira das operações não apaga os arquivos originais do volume: não libera espaço por si só. Liberação deve usar rotina específica com análise das referências e backup.

## Implantação em VPS já operacional

A instalação atual já possui PostgreSQL, usuários, titulares, Caddy e HTTPS. Para instalar a versão de documentos (se as migrações 002 e 003 já foram aplicadas, podem ser executadas novamente):

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/002_documents.sql
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/003_duplicates.sql
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/004_local_storage.sql
    docker compose up -d --build
    docker compose ps

Confirme os volumes (sem apagar nenhum):

    docker volume ls --filter name=livro-caixa

Confirme se a API responde e se o worker iniciou:

    curl -fsS https://livrocaixa.fazendanovohorizonte.com/api/health
    docker compose logs --tail 30 worker

Verifique espaço total da VPS antes de importar muitos documentos:

    df -h

## Migração de arquivos anteriores

A migração SQL preserva linhas de arquivos de um armazenamento antigo, mas NÃO copia fisicamente objetos externos para o volume local. Verifique:

    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM arquivos WHERE armazenamento = '"'"'r2'"'"'"'

Se o resultado for maior que zero, **não apague arquivos do R2** nem suas credenciais até migrar os originais. Os registros antigos ficarão marcados como pendentes de migração e não serão abertos por este backend local. Novos envios vão exclusivamente para a VPS.

## Uso e segurança

- Importação: PDF/XML/JPG/PNG, até 25 MB por arquivo, em lotes de até 20.
- Worker: OCR local com Poppler + Tesseract, XML estruturado e interpretação opcional por API de IA (OPENAI_API_KEY). Sem IA, a separação de vários documentos em um PDF não é confiável.
- Propostas precisam ser explicitamente revisadas e aprovadas, não entram no livro automaticamente.
- Organização por titular → competência → categoria → operação, com arquivos vinculados.
- Senhas permanecem em hash. Repositório deve ser privado.
- Mantenha backup externo: volume persistente não é backup; falhas da VPS ainda podem causar perda.
- Caddy deve continuar apontando "livrocaixa-web:3000". Não publicar porta da aplicação ou do PostgreSQL no host.
