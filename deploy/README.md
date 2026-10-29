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

## Leitura local automática (sem IA)

O Livro Caixa funciona sem chave de API, sem assinatura de IA e sem conexões externas no trabalhador de OCR.

Após a importação, o Tesseract ou o pdftotext obtém o texto. Um extrator local identifica:
- tipo (nota fiscal, boleto, comprovante, tributo, recibo ou contrato);
- contraparte e referência quando aparecem no documento;
- competência, data e valor por rótulos reconhecidos;
- categoria com regras de termos em português;
- titular quando o nome aparece no texto e está entre os titulares permitidos;
- notas distintas em um PDF somente se houver referências fortes distintas.

Não é possível garantir o reconhecimento de documentos arbitrários ou digitalizações ruins sem validação humana. Informações incertas geram avisos; valores e categorias não encontrados ficam pendentes. Nenhum documento é aprovado automaticamente.

### Instalação do modo local

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose up -d --build

A imagem Docker executa os testes básicos de extração local antes de construir o aplicativo. A migração 005_intelligent_review.sql deve já estar aplicada antes desta atualização.

A rede `egress` e as variáveis OPENAI foram removidas do serviço worker. A integração externa não faz parte do fluxo ativo. Para uso futuro, somente mediante escolha explícita do responsável e revisão de privacidade e custos.

Arquivos já importados e não revisados podem ser reprocessados na página de importação sem novo upload.


## IA Central por demanda (Ollama independente)

O Ollama pertence à VPS (projeto /opt/apps/ia-central), não ao Livro Caixa. O serviço central deve estar na rede Docker externa `ia_central_net`, com hostname `ollama`, modelo `qwen3-vl:2b-instruct` já baixado.

O Livro Caixa conecta APENAS o seu worker à rede externa e usa:
- OLLAMA_URL=http://ollama:11434
- OLLAMA_MODEL=qwen3-vl:2b-instruct
- `keep_alive: 0` em CADA solicitação, descarregando o modelo da RAM ao terminar.

Sem Ollama ou em caso de erro/timeout, o OCR e as regras locais seguem funcionando. Arquivos XML de NF-e utilizam extração estruturada direta, sem chamar o modelo. PDFs e imagens primeiro passam por extração/OCR e depois pelo modelo local.

A IA Central conserva o container do servidor em standby, mas não mantém o modelo carregado. Para usar o mesmo comportamento em todos os aplicativos, altere o `OLLAMA_KEEP_ALIVE` do compose da IA Central para `"0"`. Requisições individuais ainda podem sobrescrever essa configuração.

O envio começa automaticamente ao soltar arquivos na área de importação ou selecioná-los no navegador; o processamento continua assíncrono e os dados só são registrados definitivamente após aprovação.

Instalação do código do Livro Caixa:

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose up -d --build

O compose requer a rede `ia_central_net` pré-existente, mas não cria ou atualiza o container Ollama. Modelos e dados da IA Central permanecem em seu volume separado.


## Sugestão de titular e consulta pública de recebedores

Migração adicional:

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/007_enrichment.sql
    docker compose up -d --build

Ao identificar pagador/comprador com nome completo ainda inexistente, o OCR ou o Ollama
pode sugerir novo titular; **não cria** o registro nem altera a titularidade do
documento. A criação depende da confirmação de um administrador em /admin, e a
atribuição ao documento continua sendo uma ação separada na conferência.

Quando há CNPJ válido no bloco do recebedor/contraparte, o worker faz consulta
pontual à BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj}); a consulta
envia somente o CNPJ identificado, nunca o PDF ou o texto do OCR. Retorna razão
social, nome fantasia e descrição CNAE, mostrados com fonte na conferência,
e oferece esse contexto à IA local. O CNAE **não** comprova o produto adquirido,
então categorias continuam sugestões para aprovação humana.

Sem CNPJ confiável, o sistema não inventa pesquisa externa. A conferência
oferece link "Pesquisar recebedor na internet" para busca manual pelo nome.
A consulta automática é opcional ao funcionamento: se indisponível, o OCR e a
IA local continuam operando. A IA permanece um serviço compartilhado na VPS,
carregado apenas durante uma solicitação.

## Categorias sugeridas pela IA

A partir da migração `008_category_suggestions.sql`, o OCR e a IA podem
propor categorias ainda não cadastradas (por exemplo, `Veículos > Pneus`).
A sugestão aparece na conferência e pode ser editada. `Salvar para depois`
armazena a proposta sem alterar a lista global; somente `Aprovar`
cria ou reaproveita a categoria dentro da mesma transação do lançamento.
Aprovação em lote segue a mesma regra.

Instalação:

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/008_category_suggestions.sql
    docker compose up -d --build

A IA usa as categorias aprovadas do PostgreSQL nos próximos documentos e
evita a escolha automática genérica de "Outras despesas". Em Pix sem
descrição da compra, o CNAE obtido por CNPJ é uma hipótese editável.


## Explorador agrupado e data real de pagamento (migração 009)

O Explorador apresenta pastas virtuais organizadas por ano, mês, categoria e
recebedor. Dois lançamentos da mesma categoria e para o mesmo recebedor no
mesmo mês aparecem sob a mesma pasta, mas **as operações e documentos
continuam distintos no banco**. O menu de ações permanece em cada lançamento.

A aba Planilha usa `operacoes.data_pagamento` (efetivação do Pix,
transferência ou cobrança) na primeira coluna e no Excel, nunca
`criado_em`. O OCR/IA só preenche data se o documento comprovar pagamento.
Boleto não quitado e nota fiscal apenas emitida deixam a data em branco.
A conferência e os lançamentos manuais permitem informar/corrigir a data.

Atualização:

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/009_payment_date.sql
    docker compose up -d --build
    docker compose exec -T worker node worker/backfill-payment-date.mjs

O backfill examina os OCRs existentes, preenche somente operações sem data
e com evidência válida de pagamento e informa quantas foram corrigidas.
Sem evidência, mantém NULL para revisão manual. O comando pode ser repetido
sem apagar dados anteriores.
