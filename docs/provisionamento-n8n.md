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

O Google reaproveita o sub-workflow **"Google — onboarding de cliente"**
(`jHHVsAgF3YttgTZ4`, Execute Workflow Trigger) e lê o resultado na Data
table `google_clientes` — o sub-workflow grava lá.

Credenciais no n8n usadas: `Cloudflare Global Key (DNS)` (dndkbaHfLcpcLOuX),
`Avila Mail API` (gmz9uYKN7VZn98pj), `Lojas Admin Token` (3YejOYHMV6DLOJG2),
`SMTP mail.avilaops.com (n8n@avilaops.com)` (tSZlEjwt75qo2MwC), `Todoist
account` (C7xqqFDFDlihAQLG), `Auth Webhook Auth (criar caixa)`
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

## 5. Variáveis de ambiente novas (`/opt/app-avila-inc/.env.production`)

```
N8N_WEBHOOK_BASE=https://n8n.avilaops.com/webhook
N8N_AVILA_OS_TOKEN=<mesmo valor de N8N_CAIXA_WEBHOOK_TOKEN do auth>
```

## 6. O que ficou de fora e por quê

- **Registro do domínio no Porkbun/Registro.br** — não há chave de API do
  registrador em `tokens.env`. O fluxo pede o domínio já registrado e devolve
  os nameservers da Cloudflare para apontar. Quando houver chave, entra como
  passo 0 do mesmo workflow.
- **Assinatura, cofre de credenciais, marcas, etapas do onboarding** —
  são dado do app, não integração; continuam na proposta ao conselho
  (`levantamento-integracao-via-ui.md`, itens 2, 6, 7 e 9).
- **Meta/WhatsApp por cliente** — exige multi-tenant da conta da Meta.

## 7. Verificado em 30/08/2026

- Deploy `97a88ef` no ar; `x-service-key` recusa sem chave (401) e aceita
  com chave (400 sem organização, JSON no sync do Éfi: `runId 11, SUCCESS`).
- Webhook `avila-os-loja` com o token responde (não 401/403).
- **Não testado com cliente real**: adicionar domínio (cria zona na
  Cloudflare de verdade), criar loja e o onboarding do Google. Primeiro uso
  real deve ser acompanhado com a execução aberta no n8n.
