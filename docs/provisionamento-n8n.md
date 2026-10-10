# Provisionamento pela ficha do cliente, via n8n (30/08/2026)

> Decisão do Nicolas em 30/08/2026: "vamos fazer via n8n". O app é a tela e
> a fonte da verdade; toda integração com sistema de fora mora num workflow
> do n8n. Este documento é o contrato entre os dois lados.

## 1. Desenho

```
ficha do cliente (app.avilaops.com/clientes/[id])
   │ botão → POST /api/organizations/[id]/<ação>   (sessão de admin)
   ▼
src/lib/n8n.ts  ──►  https://n8n.avilaops.com/webhook/<caminho>
                     header x-avila-webhook-token  (= N8N_AVILA_OS_TOKEN)
                            │
                            ▼
                     workflow "Ávila OS — <ação>"  → Cloudflare / mail / Google / lojas / SMTP / Todoist
                            │
                     resposta síncrona (JSON)  ──►  o app grava DomainAsset, DnsRecord, OrganizationIntegration, auditoria
                     ou, para o Google (1–3 min):
                     202 na hora + POST /api/webhooks/n8n/google  (header x-service-key = SERVICE_JWT_SECRET)
```

Credenciais de terceiros (Cloudflare, mail, Google, lojas, SMTP, Todoist)
ficam **só no cofre do n8n**. O app tem dois segredos: o token de saída
(`N8N_AVILA_OS_TOKEN`) e o de entrada (`SERVICE_JWT_SECRET`, já existia).

## 2. Workflows (todos com o Handler de Erro Central → Todoist)

| Workflow | ID | Gatilho | Entrada | Saída |
|---|---|---|---|---|
| Ávila OS — Cliente aprovado | `fe7h9cdeKc5t8r1V` | `POST /webhook/avila-os-cliente-aprovado` | `{ nome, email, senha, empresa?, loginUrl?, telefone?, organizationId?, autor }` | `{ ok, emailEnviado, tarefa }` — e-mail pela caixa n8n@ + tarefa "Onboarding: <empresa>" no Todoist (Avila Ops - Projetos) |
| Ávila OS — Onboarding de domínio | `2LC9AzYuZn9ci4Ai` | `POST /webhook/avila-os-dominio` | `{ dominio, organizacao, organizationId, contatoEmail, site: "hetzner"\|"nenhum", autor }` | `{ ok, zoneId, zoneStatus, nameServers, zonaCriada, registrosCriados[], registrosExistentes[], mail }` |
| Auth — Criar caixa de e-mail (já existia) | `MD92M7SYm0YfC1ue` | `POST /webhook/auth-criar-caixa` | `{ domain, username, password, displayName?, ownerEmail?, notifyTo?, autor }` | `{ ok, address, quotaGb, webmail }` |
| Ávila OS — Google do cliente | `DWHYVm4Z4jzaJIvL` | `POST /webhook/avila-os-google` | `{ empresa, dominio, donoEmail?, pixelId?, sitemap?, indexar?, myBusiness?, organizationId, callbackUrl }` | `202 { aceito }`; depois callback com `{ organizationId, dominio, status, ga4PropertyId, ga4MeasurementId, gtmContainerId, gtmPublicId, searchConsole, indexacao, myBusiness, pendencias }` |
| Ávila OS — Criar loja | `a1nRmYum4BviiUEY` | `POST /webhook/avila-os-loja` | `{ slug, nome, plano?, dominioPrincipal?, emailContato?, whatsapp?, telefone?, razaoSocial?, cnpj?, provisionar? }` | `{ ok, status, slug, url, situacao, provisionamento, erro }` |
| Ávila OS — Sincronizar Éfi (diário) | `cB0Ue6wkYK2gHAIZ` | 06:20 todo dia | — | chama `POST /api/integrations/efi/sync` `{ days: 7 }` com `x-service-key` |
| Ávila OS — Faturamento recorrente (diário) | `S7FwBU1svbXAYbnJ` | 05:50 todo dia — **desligado** desde a criação (10/10/2026) | — | chama `POST /api/billing/faturamento/run` com `x-service-key`; execução fica vermelha se alguma assinatura falhar. O que falta para ligar está em `mercadopago-auditoria-e-roadmap.md`, Fase 2 |
| Ávila OS — Criar restaurante | `7P1HG3yLSsTT4uJc` | `POST /webhook/avila-os-restaurante` | `{ nome, cnpj, donoNome, donoEmail, slug?, plano?, razaoSocial?, segmento?, whatsapp?, cidade?, uf?, cep?, endereco?, organizationId?, autor? }` | `{ ok, criado, tenantId, slug, nome, situacao, url, entrada, senhaEmpresa, acessos[], aviso, erro }` — cria a casa no Comandeiro. CNPJ repetido volta `criado: false`, sem erro |
| Ávila OS — Cobrança (Mercado Pago) | `dnogHqXQKSfZRbMF` | `POST /webhook/avila-os-cobranca` | `{ titulo, centavos, referencia?, email?, organizationId?, autor? }` — `centavos` inteiro, mínimo 100 | `{ ok, status, id, link, titulo, valorCentavos, referencia, criadoEm, erro }` — cria preferência de checkout; pedido inválido volta 400 sem falhar a execução |

O Google reaproveita o sub-workflow **"Google — onboarding de cliente"**
(`jHHVsAgF3YttgTZ4`, Execute Workflow Trigger) e lê o resultado na Data
table `google_clientes` — o sub-workflow grava lá.

Credenciais no n8n usadas: `Cloudflare Global Key (DNS)` (dndkbaHfLcpcLOuX),
`Avila Mail API` (gmz9uYKN7VZn98pj), `Lojas Admin Token` (3YejOYHMV6DLOJG2), `Comandeiro Admin Token`
(T6NmIzS6BJNXLH9l — header `x-admin-token`, criada em 30/08 pela API REST),
`SMTP mail.avilaops.com (n8n@avilaops.com)` (tSZlEjwt75qo2MwC), `Mercado Pago —
conta Avila Ops (produção)` (E97yJucYaoBNUY4l — header `Authorization: Bearer`,
criada em 30/08 pela API REST, conferida contra `/users/me` antes de guardar), `Todoist
OAuth2 (app da casa)` (HjSrKt2tqWYpxU8I — a antiga `Todoist account` por API
key morreu em 26/08 e não deve mais ser usada), `Auth Webhook Auth (criar caixa)`
(ERbhX2hnqN9kRYSC, header de entrada) e **`Ávila OS Service Key`**
(vlxByGSlMgxGdmST, criada em 30/08 pela API REST do n8n com o
`SERVICE_JWT_SECRET` do app).

## 3. O que o app faz com cada resposta

| Ação | Rota | Grava |
|---|---|---|
| Aprovar solicitação | `POST /api/registration-requests/[id]/approve` | conta em `public.portal_clients` (bcrypt 10, `role = CLIENT`, senha provisória — mesmo formato do auth), `Organization` + contato principal se o CNPJ/CPF ainda não existe, auditoria; chama "Cliente aprovado" |
| Criar / reenviar acesso | `POST /api/organizations/[id]/acesso` `{ acao }` | idem, pela ficha; senha nova em "reenviar" |
| Adicionar domínio | `POST /api/organizations/[id]/dominio` `{ dominio, site }` | `DomainAsset` (zona, status), um `DnsRecord` por registro criado ou já existente, `OrganizationIntegration mail_domain:<dominio>` |
| Criar caixa | `POST /api/organizations/[id]/caixa` `{ dominio, usuario, nome?, senha? }` | `OrganizationIntegration mailbox:<endereço>`; senha gerada aparece uma vez |
| Configurar Google | `POST /api/organizations/[id]/google` | `google_onboarding = PENDING`; o callback grava `google_analytics_4`, `google_tag_manager`, `google_search_console` e fecha `google_onboarding` (ACTIVE / ATTENTION / FAILED) |
| Criar loja | `POST /api/organizations/[id]/loja` | `OrganizationIntegration lojas_avilaops` (slug, URL) |
| Criar restaurante | `POST /api/organizations/[id]/restaurante` | `OrganizationIntegration comandeiro` (slug, URL); etapa `RESTAURANT`. Senha da empresa e senhas de setor voltam na resposta e **não** são gravadas nem auditadas — aparecem uma vez na tela |

Tudo entra em `OperationsAuditEvent` com o admin que clicou.

## 4. Regras que valem para a próxima ação

1. **Uma rota por ação, um workflow por ação.** Nada de webhook genérico
   com `tipo` — cada um tem contrato, timeout e tratamento de erro próprios.
2. **Idempotência é do n8n.** Rodar "Adicionar domínio" de novo não duplica
   registro na Cloudflare nem domínio no mail; o app faz `upsert`.
3. **Falha do n8n não desfaz o que o app já gravou.** Na aprovação, a conta
   existe mesmo que o e-mail não saia — a senha volta na resposta para o
   admin repassar. Nunca deixar o cliente sem conta por causa de SMTP.
4. **Segredo de terceiro não entra no app.** Se uma ação nova precisa de
   chave de API, a chave nasce no cofre do n8n (REST `POST /credentials`
   com a `N8N_API_KEY`, ver memória `n8n-api-key-infra`).
5. **Ação longa responde 202 e devolve por callback** em
   `/api/webhooks/n8n/<ação>` com `x-service-key`.

## 5. Variáveis de ambiente novas (`/opt/app-avilaops/.env.production`)

```
N8N_WEBHOOK_BASE=https://n8n.avilaops.com/webhook
N8N_AVILA_OS_TOKEN=<mesmo valor de N8N_CAIXA_WEBHOOK_TOKEN do auth>
```

## 5b. O que é dado do app (sem n8n) — 30/08, segunda rodada

Os quatro itens restantes do levantamento entraram na ficha como cartões do
painel "Cobrança e cadastro" (`src/components/OperacaoPanel.tsx`):

| Ação | Rota | Grava |
|---|---|---|
| Nova assinatura | `POST /api/organizations/[id]/assinatura` `{ descricao, valor, dia, inicio?, implantacao?, produto?, tenant? }` | `Subscription` + primeira `SubscriptionInvoice` MONTHLY (+ SETUP em 7 dias); etapa BILLING |
| Pausar / retomar / cancelar / ajustar / fatura do mês / cobrar | `PATCH /api/organizations/[id]/assinatura/[subId]` `{ acao, … }` | status da assinatura; `garantirFatura`; `criarCobrancaDaFatura` (PIX/boleto Éfi) devolve copia-e-cola ou link |
| Registrar pagamento recebido por fora | `POST /api/billing/faturas/[id]/baixa` `{ pagoEm, comprovante }` — dono pela ficha, ou `x-service-key` | cobrança `PIX_DIRETO` com o ID da transação do comprovante, fatura `PAID` na data do comprovante, pagamento em `core.payments` (`source = BAIXA_MANUAL`), auditoria `FATURA_BAIXADA_POR_FORA`. O mesmo comprovante duas vezes é uma baixa só |
| Alterar valor / criar implantação / cancelar fatura | `PATCH /api/organizations/[id]/assinatura/[subId]` `{ acao: "ajustar", valor }`, `{ acao: "implantacao", valor, vencimento }`, `{ acao: "cancelar-fatura", invoiceId }` | valor novo vale da próxima fatura em diante; implantação nasce na competência do vencimento, uma por mês; só fatura em aberto é cancelada. Os três com botão na ficha e auditoria |
| Comissão sobre vendas | `PATCH /api/organizations/[id]/assinatura/[subId]` `{ acao: "ajustar", comissao }` | `Subscription.salesCommissionPercent` (0 tira). Registra o combinado e aparece na ficha; não gera fatura |
| Guardar / listar / remover credencial | `GET/POST /api/organizations/[id]/cofre`, `DELETE …/cofre/[provider]` | `OrganizationIntegrationConnection` com `tokenCiphertext` AES-256-GCM (formato do ai-core; chave `AI_CORE_TOKEN_ENCRYPTION_KEY`, criada no servidor em 30/08) |
| Nova marca | `POST /api/organizations/[id]/marcas` | `Brand` com slug único por cliente |
| Etapas automáticas | `src/lib/onboarding-etapas.ts` → `marcarEtapa()` chamado por acesso, domínio, caixa, Google (callback), loja e assinatura | `OrganizationOnboardingStep` DONE; primeira marcação semeia as 12 etapas |

Scripts aposentados por isso: `scripts/criar-assinatura.ts` e
`scripts/sync-openai-project.ts` (ficam no repo por histórico; não usar).

~~**Decisão pendente do conselho**~~ — **resolvida em 30/08/2026**: cobrança
recorrente só pelo **Mercado Pago**. "Esquece do banco Éfi por enquanto." O que
já roda na Éfi não foi migrado nem desligado; ela só deixou de ser o caminho
padrão, e produto novo entrando no pipeline (o Comandeiro, entre eles) nasce no
Mercado Pago. `lib/assinaturas.ts` ainda emite pela Éfi — trocar isso é a
próxima obra, não foi feita aqui.

**Primeiro passo dado em 30/08/2026:** existe o workflow **Ávila OS — Cobrança
(Mercado Pago)** (`dnogHqXQKSfZRbMF`), com o token no cofre do n8n e não no app,
como manda a regra 4. Testado ponta a ponta: pedido inválido devolveu 400
(`{"ok":false,…}`) e uma cobrança real de R$ 1,00 voltou `201` com link
(`2944732714-827e0457-4fd6-4692-9294-a8e4acc926ae`), conferida depois direto na
conta do Mercado Pago. Preferência é só link de pagamento: criar não cobra
ninguém e não gera lançamento.

O que **não** foi feito, de propósito: o app continua chamando a Éfi. Trocar
`lib/assinaturas.ts` para este webhook mexe em cobrança de cliente e é decisão
de corte, não de implementação — o workflow está pronto e provado, esperando a
sua ordem.

## 5c. Comandeiro no pipeline — 30/08, terceira rodada

O Comandeiro já era multi-tenant por dentro (`provisionTenant` +
`registerRestaurant` atendem o autosserviço em `/acesso/criar` e o painel em
`/platform/onboarding`). O que faltava era a porta HTTP. Ela nasceu como
**terceira porta para a mesma função** — nenhuma regra de cadastro foi
duplicada, pelo motivo de sempre: a cópia que envelheceria seria justamente a
que ninguém abre no navegador para conferir.

```
ficha do cliente → POST /api/organizations/[id]/restaurante
   → n8n "Ávila OS — Criar restaurante" (7P1HG3yLSsTT4uJc)
   → POST https://app.comandeiro.com.br/api/admin/tenants   (x-admin-token)
   → registerRestaurant()  →  tenant + senha da empresa + 3 senhas de setor
```

Três coisas que este fluxo faz diferente dos outros:

1. **A resposta carrega segredo.** A senha da empresa e as três senhas de setor
   existem em claro só no instante em que a casa nasce. Vão para a tela e
   morrem ali: não entram em `OrganizationIntegration`, não entram em
   `OperationsAuditEvent`. O que a auditoria registra é que a casa nasceu, não
   como entrar nela. Reemissão é pela recuperação de senha do próprio
   Comandeiro, com o e-mail do responsável.
2. **Idempotência é do Comandeiro, não do n8n.** CNPJ que já tem casa devolve
   `200 { criado: false }` com o vínculo, e não erro — o CNPJ é a identidade da
   casa na entrada, então "já existe" é uma resposta, não uma falha. Clicar
   duas vezes na ficha não abre tarefa P1 no Todoist.
3. **CNPJ é obrigatório na ficha.** A rota recusa em 422 antes de gastar
   chamada ao n8n: sem CNPJ de 14 dígitos não há restaurante para criar,
   porque é ele que o garçom digita para entrar.

O `Montar resposta` do workflow traduz 401, 404 e 503 do Comandeiro em frases
que dizem o que fazer (token, deploy, variável de ambiente) — o operador da
ficha não deve receber "HTTP 404" e abrir chamado.

**Variável nova no Comandeiro** (`/opt/minas-espetinhos/.env`):
`COMANDEIRO_ADMIN_TOKEN`, o mesmo valor da credencial `Comandeiro Admin Token`
do n8n. Vazio desliga a rota (503).

## 6. O que ficou de fora e por quê

- **Registro do domínio** — o fluxo pede o domínio já registrado e devolve os
  nameservers da Cloudflare para apontar. A compra em si continua manual, e
  por decisão de 31/08/2026 ela tem endereço fixo:

  | Extensão | Onde registrar | Por quê |
  |---|---|---|
  | `.com`, `.app`, `.dev` e demais genéricos | **Cloudflare Registrar** | é onde o DNS já mora, vende a preço de custo e não empurra serviço |
  | `.com.br` e `.br` | **Registro.br**, direto | não existe intermediário que valha a pena, e o CNPJ do cliente é exigido de qualquer jeito |

  O domínio é registrado **no nome do cliente**, com a Ávila Ops como contato
  técnico (decisão de 30/08). Os dois registradores suportam esse arranjo.
  O Porkbun sai de cena: era mais um lugar para guardar senha, sem ganho.

  **A Ávila Ops não vira revendedora de domínio.** Revenda exige
  credenciamento, margem própria, suporte e responsabilidade sobre a renovação
  de terceiro; é um produto inteiro, não um atalho. Se um dia valer a pena,
  entra como decisão própria, com preço e contrato, não como consequência
  disto aqui.
- ~~Assinatura, cofre, marcas, etapas~~ — feitos em 30/08 (seção 5b).
- **Meta/WhatsApp por cliente** — exige multi-tenant da conta da Meta.

## 7. Verificado em 30/08/2026

- Deploy `97a88ef` no ar; `x-service-key` recusa sem chave (401) e aceita
  com chave (400 sem organização, JSON no sync do Éfi: `runId 11, SUCCESS`).
- Webhook `avila-os-loja` com o token responde (não 401/403).
- **Cliente aprovado** de ponta a ponta: e-mail entregue (claude@ e
  nicolas@) e tarefa aberta no Todoist — depois que o Nicolas trocou a
  credencial Todoist para OAuth2 (a de API key estava morta desde 26/08, e
  com ela o Handler de Erro Central; os 22 nós Todoist de 14 workflows
  foram migrados na madrugada de 30/08).
- **Onboarding de domínio** rodado a seco contra `avilaops.com` (`site:
  nenhum`): zona achada, mail devolveu o domínio já provisionado, os 4
  registros (MX, SPF, DKIM, DMARC) reconhecidos como existentes e **nada
  foi criado** — inclusive SPF e DMARC com conteúdo divergente, que voltam
  marcados `divergente: true` em vez de virar segundo TXT. Verificação do
  mail: `active`, `ready: true`. O contrato real do mail para os registros é
  `dns_records[{ type, host, value, priority? }]`.
- **Não testado com cliente real**: criar loja e o onboarding do Google
  (criam coisas de verdade). Primeiro uso deve ser acompanhado com a
  execução aberta no n8n.

## 8. Onde o app mora no servidor (padrão, 31/08/2026)

| O quê | Nome |
|---|---|
| Domínio e repositório | `app.avilaops.com` |
| Pasta no Hetzner | `/opt/app-avilaops` |
| Projeto e container do Docker | `app-avilaops`, `app-avilaops-app-1` |
| Porta local (Caddy aponta para ela) | `127.0.0.1:3004` |

O nome antigo era `app-avila-inc`, herdado de quando o domínio principal era
`avila.inc`. A renomeação é de 31/08/2026, por decisão do Nicolas, para o
servidor falar o mesmo nome que o repositório.

Antes de qualquer deploy, confirme para onde o container em pé aponta, em vez
de assumir o caminho:

```bash
docker inspect app-avilaops-app-1 \
  --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
```

Isso não é preciosismo: em 31/08/2026 um envio caiu na pasta antiga no exato
minuto da renomeação e subiu um container que brigou pela porta 3004 com o que
já estava servindo.
