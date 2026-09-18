# Inventário das chaves de integração

Levantamento de 17/09/2026, gerado por `npm run chaves:inventario`
(`scripts/inventario-chaves.mjs`). O script varre o monorepo inteiro e cruza,
para cada chave, **quem lê no código** contra **onde ela tem valor**. Rode de
novo depois de qualquer mexida — os números abaixo são um retrato, não verdade
permanente.

Retrato atual: **122 chaves**, das quais **61 são lidas por código** e
**61 nunca são lidas por ninguém**.

## O que o levantamento mostrou

### 1. Metade das chaves é anotação, não configuração

61 chaves não aparecem em nenhum `process.env` do monorepo. Preencher essas
chaves num `.env` não produz efeito nenhum — são dados de referência que alguém
guardou em formato de variável de ambiente:

`WHATSAPP_NUMERO_AVILAOPS`, `WHATSAPP_PIN_AVILAOPS`, `WHATSAPP_WABA_AVILAOPS`,
`WHATSAPP_PHONE_ID_PESSOAL_NAO_USAR`, `WHATSAPP_NEGOCIO_ID`,
`GERENCIADOR_ANUNCIO_APP_ID`, `FACEBOOK_BUSINESS_ID`, `META_APP_DISPLAY_NAME`,
`META_APP_CONTACT_EMAIL`, `THREADS_APP_ID`, todas as `X_*`, entre outras.

Esse é exatamente o tipo de dado que deveria estar **cadastrado na plataforma**,
com nome, dono e histórico — não copiado em 12 arquivos de ambiente.

**Nenhuma chave `X_*` (Twitter) é lida por código algum.** São 13 chaves
copiadas por todo o parque sem nenhum consumidor.

### 2. Vinte e cinco chaves são lidas pelo código e não têm valor em lugar nenhum

Essas são integrações quebradas hoje, não pendências futuras:

| Chave | Quem lê |
|---|---|
| `META_CONVERSIONS_API_TOKEN`, `META_PIXEL_ID`, `META_CONVERSIONS_TEST_CODE` | `saudepet.app.br/backend` |
| `META_PAGE_ACCESS_TOKEN` | `saudepet.app.br/backend` (webhook) |
| `META_THREADS_ACCESS_TOKEN`, `META_THREADS_USER_ID` | `saudepet.app.br/backend` |
| `META_ACCESS_TOKEN` | `config/ferramentas/tagflow` |
| `FACEBOOK_CAPI_TOKEN` | `arxisvr.avilaops.com/backend` |
| `WHATSAPP_FLOW_PRIVATE_KEY` / `_BASE64` | `app.avilaops.com/src/lib/whatsapp.ts` |
| `MP_CLIENT_ID`, `MP_WEBHOOK_TOKEN`, `MP_SYNC_DAYS` | `app.avilaops.com/src/lib/mercadopago.ts` |
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | `Websites/mostruario/fenixeletrodos.com.br` |
| `GOOGLE_ADS_*`, `GOOGLE_CREDS_JSON`, `GOOGLE_API_KEY`, `GOOGLE_GENAI_API_KEY` | tagflow, assistente-gemini, lojas |

Vale reparar em `MERCADO_PAGO_ACCESS_TOKEN` (sem valor) contra
`MERCADO_PAGO_ACCES_TOKEN_PROD` (valor em 13 arquivos): o nome com o typo
"ACCES" é o que está preenchido, e serviços diferentes leem nomes diferentes
para a mesma credencial.

### 3. O segredo da Meta está espalhado em 12 arquivos de ambiente

`META_APP_ID` e `META_APP_SECRET` têm valor — o do app **excluído** — em:

```
.lojas-blog-release/.env.local            alobarbeiro.com.br/.env.production
.lojas-blog-release/.env.production.lojas arxisvr.avilaops.com/.env.production
auth.avilaops.com/.env.production         crm.avilaops.com/.env.production
lojas.avilaops.com/.env.local             lojas.avilaops.com/.env.production
mail.avilaops.com/.env.production         saudepet.app.br/.env.production
Websites/mellotransportesriopreto.com.br/.env.production
app.avilaops.com/.deploy-health-runtime-20260911/.env.production
```

`Websites/mellotransportesriopreto.com.br/.env.production` é o arquivo mais
pesado do parque: contém **todas** as chaves do levantamento, inclusive as de
serviços que nada têm a ver com aquele site.

Criar o app novo da Meta e sair preenchendo isso à mão significa editar 12
arquivos e torcer para não esquecer nenhum — e repetir o processo na próxima
troca de credencial.

### 4. `src/lib/meta.ts` existe em três cópias

`app.avilaops.com/src/lib/meta.ts`, `app-banco-dados/src/lib/meta.ts` e
`app.avilaops.com/.deploy-health-runtime-20260911/src/lib/meta.ts` são o mesmo
arquivo duplicado. O mesmo vale para `whatsapp.ts` e `mercadopago.ts`. Qualquer
correção precisa ser aplicada três vezes, e hoje elas já divergiram.

## Duas camadas diferentes, que não devem ser tratadas junto

O levantamento deixa claro que "chave de integração" são duas coisas:

**Credencial da plataforma** — `META_APP_ID`, `META_APP_SECRET`,
`MP_CLIENT_SECRET`, `X_CONSUMER_*`. São segredos da Ávila Ops, iguais para todos
os clientes, e mudam raramente. Vazam tudo se vazar um arquivo.

**Token por cliente** — o access token da Meta de cada organização. Isso **já
está resolvido**: `OrganizationIntegrationConnection.tokenCiphertext` guarda
cifrado com `META_TOKEN_ENCRYPTION_KEY`, por organização, com escopos, validade
e status de sincronização. Essa parte do desenho está certa e não precisa mudar.

A dor toda está na primeira camada.

## Como regerar

```
npm run chaves:inventario              # resumo legível
node scripts/inventario-chaves.mjs --json   # bruto, para diff entre datas
node scripts/inventario-chaves.mjs --raiz=. # só este projeto
```
