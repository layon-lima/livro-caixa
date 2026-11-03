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
- Worker: extração PDF com Poppler, OCR Tesseract (português e inglês), XML estruturado e reconhecimento local. PDFs com vários documentos exigem referências fortes para separação automática.
- Propostas precisam ser explicitamente revisadas e aprovadas, não entram no livro automaticamente.
- Organização por titular → competência → categoria → operação, com arquivos vinculados.
- Senhas permanecem em hash. Repositório deve ser privado.
- Mantenha backup externo: volume persistente não é backup; falhas da VPS ainda podem causar perda.
- Caddy deve continuar apontando "livrocaixa-web:3000". Não publicar porta da aplicação ou do PostgreSQL no host.

## Leitura OCR local e aprendizado por aprovação

O Livro Caixa não usa modelo de IA, API de interpretação, Ollama ou serviço externo. O worker lê OCR local e aplica regras de identificação, complementadas exclusivamente pelo histórico confirmado por usuários.

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

O worker não participa de redes de IA e não envia texto extraído para modelos externos ou locais. O serviço ZIP também opera apenas com arquivos e banco internos.

Arquivos já importados e não revisados podem ser reprocessados na página de importação sem novo upload.


## Sugestão de titular e consulta pública de recebedores

Migração adicional:

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/007_enrichment.sql
    docker compose up -d --build

Ao identificar pagador/comprador com nome completo ainda inexistente, o OCR local
pode sugerir novo titular; **não cria** o registro nem altera a titularidade do
documento. A criação depende da confirmação de um administrador em /admin, e a
atribuição ao documento continua sendo uma ação separada na conferência.

A consulta pública de CNPJ foi desativada no processamento atual; a classificação usa
OCR local e aprovações anteriores do mesmo titular.

## Sugestões de categoria e aprendizado local

A partir da migração `008_category_suggestions.sql`, a conferência permite
propor categorias ainda não cadastradas. O OCR só seleciona categorias existentes quando há evidência.
A sugestão aparece na conferência e pode ser editada. `Salvar para depois`
armazena a proposta sem alterar a lista global; somente `Aprovar`
cria ou reaproveita a categoria dentro da mesma transação do lançamento.
Aprovação em lote segue a mesma regra.

Instalação:

    cd /opt/apps/livro-caixa
    git pull --ff-only
    docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/008_category_suggestions.sql
    docker compose up -d --build

O aprendizado por aprovação guarda as categorias por titular e recebedor; em um documento semelhante, sugere uma categoria existente que o usuário confirma antes do lançamento. Não assume categorias genéricas sem evidência.


## Explorador agrupado e data real de pagamento (migração 009)

O Explorador apresenta pastas virtuais organizadas por ano, mês, categoria e
recebedor. Dois lançamentos da mesma categoria e para o mesmo recebedor no
mesmo mês aparecem sob a mesma pasta, mas **as operações e documentos
continuam distintos no banco**. O menu de ações permanece em cada lançamento.

A aba Planilha usa `operacoes.data_pagamento` (efetivação do Pix,
transferência ou cobrança) na primeira coluna e no Excel, nunca
`criado_em`. O OCR local só preenche data se o documento comprovar pagamento.
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

## OCR local com aprendizado humano (migração 010)

O OCR local reconhece tipo, recebedor, pagador, datas, valores e referências. O histórico
aprovado ensina categorias por titular e contraparte e permite reconhecer aliases de
pagador comprovados repetidamente. Não há chamadas para modelos de IA, Ollama ou
consulta externa de CNPJ; lançamentos continuam exigindo aprovação humana.

Após `git pull --ff-only` na VPS, execute:

```bash
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/008_category_suggestions.sql
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/009_payment_date.sql
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/010_classification_learning.sql
docker compose up -d --build app worker
```

O Dockerfile executa os testes do worker e compila o Next.js no build.

## Nome inteligente de documentos no Explorador

A coluna Arquivo usa o tipo identificado (Pix, boleto, nota fiscal etc.),
a categoria do lançamento e o fornecedor para propor um nome explicativo.
Exemplo: `PIX ABASTECIMENTO AUTO POSTO BARBOSAO 28-10-2026.pdf`.

Aplica-se também a documentos anteriormente aprovados e aos exibidos na
conferência/importação. Correções na categoria e na contraparte atualizam
automaticamente a apresentação. Para PDFs contendo vários documentos, o
nome de origem permanece para não confundir os arquivos. Não renomeia o
objeto original no armazenamento, não mexe na assinatura nem no hash,
e preserva a extensão. Após aprovação de documento único, o nome sugerido
também é usado quando aberto/salvo pelo navegador.

Atualização: apenas código, **sem migração SQL**.
```bash
git pull --ff-only
docker compose up -d --build app worker
```

## Navegação simplificada: planilha única

O modo Explorador (abas, pastas virtuais por categoria/recebedor e árvore de
pastas) foi retirado. O usuário seleciona um titular na barra lateral e sua
planilha de saídas aparece diretamente, sem a antiga aba "Explorador".
Os filtros por mês/categoria, a pesquisa, a exportação, os documentos e as
ações de edição continuam funcionando. Links antigos com filtros básicos são
aceitos na planilha. Nenhum lançamento foi excluído e não há migração SQL.

Implantar na VPS, no diretório do aplicativo:

```bash
git pull --ff-only
docker compose up -d --build app worker
```

## ZIP em massa: extração e processamento sequencial (migração 011)

Arraste um **ZIP** com PDFs, XMLs e imagens pelo importador ou sobre a janela.
Limites de segurança: ZIP até 80 MB, no máximo 300 documentos, 25 MB por
documento e 500 MB descompactados. Não extrai pastas no filesystem: lê cada
membro na memória, valida e grava como documento original compactado usando
o mesmo deduplicador das importações comuns.

Os itens entram imediatamente na fila do PostgreSQL. O worker OCR já
seleciona um documento por vez; não depende do navegador e continua rodando
enquanto o usuário confere e aprova os primeiros arquivos prontos. A página
`/conferencia?lote=UUID` mostra o progresso do lote e atualiza a lista
automaticamente. As aprovações mantêm a referência ao lote para abrir o próximo.

**Antes de atualizar o app**, aplicar a migração 011, sem excluir tabelas:
```bash
cd /opt/apps/livro-caixa
git pull --ff-only
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/011_zip_import_batches.sql
docker compose up -d --build app worker
```

Se o proxy limitar uploads a menos de 80 MB, sua configuração de tamanho de
corpo HTTP também precisará aceitar ZIPs desse tamanho.

## Categorias simples, sem subcategorias (migração 012)

Sete categorias padrão: Compras Pessoais, Compras Fazenda, Abastecimento,
Manutenção Fazenda, Pagamento de Serviços, Pagamento de Dívidas Fazenda,
Pagamento de Dívidas Pessoais. As categorias antigas são desativadas (não
apagadas). Lançamentos aprovados mantêm seu histórico; propostas pendentes
com classificação antiga ou sugestão automática são liberadas para nova
conferência. O OCR utiliza apenas as categorias ativas, e o usuário
continua podendo criar uma categoria manualmente. Nenhuma categoria
extra sugerida foi cadastrada.

Na VPS, após o código estar atualizado:

```bash
cd /opt/apps/livro-caixa
git pull --ff-only
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/012_flat_categories.sql
docker compose up -d --build app worker
```

## Correção da conferência: descarte, pagador Pix e fluxo simples (migração 013)

A interface agora apresenta Documento → Conferência → Lançamento. Não solicita
mais "vinculação com operação existente" e nunca vincula automaticamente uma
operação apenas por sugestão. O usuário pode aprovar um lançamento, salvar para
depois ou descartar (inclusive durante a leitura do ZIP). Descartar é lógico:
o registro e os originais ficam preservados para auditoria; lançamentos já
aprovados não podem ser descartados pela conferência. O reenvio explícito de
um arquivo descartado pode colocá-lo de volta na fila após terminar o OCR.

O OCR de Pix distingue "quem fez/pagou" de "quem recebeu". O nome do pagador
aparece na conferência, e a seleção automática do titular só ocorre quando há
correspondência única com os titulares autorizados. Caso contrário, o usuário
escolhe o titular antes da aprovação. Arquivos antigos que ainda não foram
conferidos podem ser reprocessados para aproveitar o novo extrator.

**Aplicar primeiro a migração 013**, depois reconstruir o app e o worker:
```bash
cd /opt/apps/livro-caixa
git pull --ff-only
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/013_discard_pix_payer.sql
docker compose up -d --build app worker
```

## Conferência redesenhada (interface 2026)

Nova visualização da conferência inspirada no layout aprovado:
- Barra lateral reduzida à navegação principal durante conferência;
- Fila de documentos com busca, filtros, páginas e aprovação em lote;
- Sem bloco superior de "Fila do ZIP" com contadores grandes;
- Cabeçalho do documento, resumo estruturado, checklist interativo e formulário
  sempre visível com as informações essenciais;
- Botões Abrir original / Próximo / Salvar / Descartar e barra inferior Aprovar /
  Salvar para depois / Descartar;
- Documentos em leitura continuam acompanhados pela mesma fila progressiva;
- Documentos já aprovados podem ser consultados pela aba Conferidos do ZIP;
- Sem alteração de banco, nenhuma migração necessária.

Implantar somente app e CSS (worker não é alterado por esta interface):
```bash
cd /opt/apps/livro-caixa
git pull --ff-only
docker compose up -d --build app
```

## Bloqueio de duplicidades — migração 014

O sistema protege importação, aprovação individual e em lote, lançamentos
manuais, edição e restauração de lançamentos. A importação já dispõe de SHA-256
único para impedir o mesmo arquivo físico; a migração 014 acrescenta uma chave
única em `operacoes.chave_duplicidade` para **identificadores confiáveis**
(EndToEndId Pix, chave NF-e e código de boleto completo). O índice é parcial
(apenas lançamentos ativos) e não reclassifica, edita nem exclui operações antigas.

O servidor verifica **dentro da mesma transação que grava**:
1. Identificador forte (verifica lançamentos antigos pela referência e novos
   pela chave; nunca aceita registro duplicado);
2. Possível semelhança: mesmo titular, data efetiva, valor, tipo e recebedor.
   Exige confirmação humana explícita em vez de bloquear pagamentos reais.
3. Dois Pix com EndToEndId diferentes não são bloqueados por semelhança simples.
4. Transações concorrentes são serializadas com advisory locks e a restrição
   UNIQUE garante o bloqueio até em condições de corrida.
5. Na aprovação em lote, um item conflitante desfaz todo o lote de aprovação,
   sem gerar lançamentos parciais; o usuário confere o item individualmente.

No processo de leitura OCR, o EndToEndId Pix é extraído do comprovante somente
se houver um identificador único no trecho do documento. Campos desconhecidos
não são inventados. Uma confirmação de lançamento semelhante fica registrada
no histórico de aprovação. A verificação não garante eliminar ambiguidades
quando não existe identificador ou os dados do documento estão incompletos.

Antes do build, executar a migração no banco de dados:

```bash
cd /opt/apps/livro-caixa
git pull --ff-only
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < db/migrations/014_duplicate_guard.sql
docker compose up -d --build app worker
```


## Desativação da integração IA Central (novembro de 2026)

O Livro Caixa não depende mais do projeto `/opt/apps/ia-central`. Foram removidos
as variáveis de Ollama, o cliente do modelo, a rede `ia_central_net` no worker e os
indicadores da IA na conferência. O mecanismo permanece com Poppler, Tesseract,
XML, regras locais e memória das aprovações já realizadas.

Atualize com `git pull --ff-only && docker compose up -d --build app worker zip-worker`.
O Ollama é um projeto separado na VPS. Após atualizar o Livro Caixa, rode
`sh scripts/remove-ai-central.sh` para **remover a IA Central dedicada**, inclusive
os volumes dos modelos. O script verifica se outros aplicativos fazem referência
à rede ou se há contêineres estranhos conectados e **aborta sem destruir nada**
quando encontra compartilhamento. A remoção do Livro Caixa da rede é automática
ao recriar o worker. Os documentos e lançamentos do Livro Caixa são preservados.
