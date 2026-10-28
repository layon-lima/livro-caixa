# Livro Caixa Inteligente

Plataforma web para **organizar** documentos e operações por titular, competência e categoria. O objetivo é identificação, classificação, vinculação e pesquisa documental — **não é gestão de saldos bancários**.

## Camada 01 — fundação

- Next.js 16, TypeScript e React.
- Estrutura visual compacta inspirada no Explorador de Arquivos do Windows.
- Preparação para PostgreSQL privado e Cloudflare R2.
- Docker Compose isolado, com conexão ao Caddy compartilhado.
- Endpoint técnico `/api/health`.

**Ainda não há login, titulares cadastrados, OCR, operações reais, importação nem conferência.** Esses recursos serão implementados nas próximas camadas; a interface inicial não inclui dados demonstrativos.

## Início local

Requer Node.js 24 (ou versão compatível), npm e PostgreSQL quando os módulos de dados forem ativados.

```bash
npm install
cp .env.example .env
npm run dev
```

Abra `http://localhost:3000`. Em produção, use Docker.

## Instalação na VPS

Leia [deploy/README.md](deploy/README.md). **Não aplique modificações no Caddy compartilhado sem verificar sua configuração atual.**

## Regras de desenvolvimento

- Um repositório, uma aplicação Next.js, sem microserviços desnecessários.
- Separar código por módulos e implementar cada camada somente após definição funcional.
- Nenhum arquivo pessoal, PDF, XML, token, senha ou `.env` pode entrar no Git.
- Documentos originais ficam no R2 privado; dados estruturados, relacionamentos e texto extraído ficam no PostgreSQL.
- Um livro independente por titular, categorias compartilhadas, OCR sempre com aprovação humana.
- Interface com alta densidade de informações e sem dashboards financeiros.

## Segurança

O repositório deve ser **privado** antes de receber detalhes operacionais. Autenticação e controle de permissões por titular serão implementados na Camada 02. Não introduza documentos reais antes de autenticação e autorização estarem ativas.
