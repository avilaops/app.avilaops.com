# Conferência visual do Financeiro

Prints da fase 1 da refatoração do módulo (30/09/2026) em `fase1/`: antes e
depois, em 390, 768 e 1440 de largura, temas claro e escuro. Feitos com
Chromium via Playwright contra a aplicação rodando de verdade.

Os dados são **inventados** (`seed-visual.mjs`): as mesmas nove contas de
produção, com nomes, moedas e provedores iguais, e movimentações de mentira
no formato de cada uma. O Mercado Pago e a plataforma de Lojas respondem por
`mock-fetch.mjs`, que reproduz os casos que quebravam a tela (apelido de conta
de 40 caracteres, referência `arxisvr:u-smoke-…`, descrição longa de
pagamento). Nenhum print carrega extrato de verdade.

## Como repetir

Mesmo caminho de `docs/prints/icones-da-marca/README.md` (Postgres 18 local em
cluster próprio, papel `app_avila` antes das migrações, `localhost` e nunca
`127.0.0.1`, login por cookie). A diferença é o `next dev`, que sobe com o mock:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55433/fin_dev" \
APP_JWT_SECRET="segredo-conferencia-visual-local" \
R2_BUCKET="" CLOUDFLARE_ACCOUNT_ID="" R2_ACCESS_KEY_ID="" R2_SECRET_ACCESS_KEY="" \
EFI_CLIENT_ID="" PAYPAL_CLIENT_ID="" \
MP_ACCESS_TOKEN="mock" MP_CLIENT_ID="123" LOJAS_API_URL="http://lojas.mock" LOJAS_ADMIN_TOKEN="mock" \
NODE_OPTIONS="--import=file:///<caminho>/docs/prints/financeiro/mock-fetch.mjs" \
npx next dev -p 3211

node docs/prints/financeiro/seed-visual.mjs
node docs/prints/financeiro/conferir.mjs ./tiros     # no Git Bash: MSYS_NO_PATHCONV=1
```

`MP_ACCESS_TOKEN` precisa estar preenchido: vazio, `mercadopago.ts` tenta ler
`../docs/.env.production`, que na pasta principal do monorepo é o token de
produção.

## O que o roteiro reprova

- erro no console ou exceção na página;
- tema pintado diferente do pedido (`data-theme`, não `prefers-color-scheme`);
- qualquer elemento passando da largura da tela, ou cortado por um pai com
  `overflow: hidden`. Contêiner que rola na horizontal de propósito não conta;
- no celular, o fim do conteúdo atrás da barra de abas (o print `-fim` mostra
  o final da página com a barra no lugar).
