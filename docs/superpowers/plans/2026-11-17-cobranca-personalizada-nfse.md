# Cobrança Personalizada e Orquestração NFS-e Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar faturas personalizadas com boleto/PIX, régua individual e emissão fiscal automática/manual pelo ERP.

**Architecture:** O app mantém fatura, cobrança, pagamento e comunicação. Uma fila fiscal persistente chama a API privada do P003 com idempotência e sincroniza estados; o navegador nunca recebe credenciais de serviço.

**Tech Stack:** Next.js 16 • TypeScript • Prisma/PostgreSQL • Mercado Pago • API privada do ERP P003 • Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-cobranca-personalizada-nfse-design.md`

## Global Constraints

- Textos e rótulos usam `•` como separador.
- Apenas o dono cria cobrança, altera régua, emite ou cancela NFS-e.
- Fatura `CUSTOM` tem `organizationId` obrigatório e `subscriptionId` nulo.
- O app não armazena certificado, senha ou XML fiscal integral.
- Pagamento confirmado nunca é revertido por falha fiscal.
- Produção fiscal fica desligada até homologação do P003.

## Review Focus

- Cliente sem assinatura consegue receber fatura `CUSTOM` sem assinatura técnica • Task 1.
- Webhook repetido cria um único comando fiscal • Task 5.
- Etapa de régua em processamento/enviada não pode ser editada • Task 3.
- Boleto sem cadastro obrigatório falha antes de criar cobrança externa • Task 2.
- ERP indisponível preserva pagamento e agenda repetição fiscal sem duplicidade • Tasks 4 e 5.

---

### Task 1: Fatura avulsa vinculada ao cliente

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261117xxxxxx_custom_invoice/migration.sql`
- Create: `tests/integration/fatura-personalizada.test.ts`
- Create: `src/lib/fatura-personalizada.ts`

**Interfaces:**
- Produces: `criarFaturaPersonalizada(input, actorId)` e `SubscriptionInvoice.kind = "CUSTOM"` com `organizationId`.

- [ ] **Step 1: Testar criação sem assinatura, backfill, moeda BRL, competência, centavos e autorização**
- [ ] **Step 2: Rodar teste e confirmar falha**
- [ ] **Step 3: Migrar relação de fatura e implementar serviço transacional com auditoria**
- [ ] **Step 4: Rodar integração, Prisma validate e drift**
- [ ] **Step 5: Commit `feat: criar faturas personalizadas por cliente`**

### Task 2: Tela e emissão de boleto/PIX

**Files:**
- Create: `src/app/api/organizations/[id]/faturas/route.ts`
- Create: `src/components/CobrancaPersonalizadaForm.tsx`
- Modify: `src/components/OperacaoPanel.tsx`
- Modify: `src/app/clientes/[id]/page.tsx`
- Create: `tests/unit/cobranca-personalizada-form.test.tsx`
- Create: `tests/integration/cobranca-personalizada-route.test.ts`

**Interfaces:**
- Consumes: `criarFaturaPersonalizada` e rota atual de cobrança da fatura.
- Produces: formulário com descrição, valor, competência, vencimento, PIX/BOLETO e emissão fiscal.

- [ ] **Step 1: Testar validação, dono, cliente, campos fiscais e falha anterior ao provedor**
- [ ] **Step 2: Confirmar testes vermelhos**
- [ ] **Step 3: Implementar API e UI seguindo os padrões da ficha**
- [ ] **Step 4: Rodar testes e Playwright da ficha em desktop/celular**
- [ ] **Step 5: Commit `feat: cadastrar cobrança personalizada na ficha`**

### Task 3: Régua individual editável

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261117xxxxxx_custom_billing_schedule/migration.sql`
- Modify: `src/lib/regua-cobranca-email.ts`
- Create: `src/lib/regua-cobranca-individual.ts`
- Create: `src/app/api/billing/faturas/[id]/lembretes/route.ts`
- Modify: `src/app/api/billing/faturas/[id]/lembretes/[dispatchId]/route.ts`
- Modify: `src/components/OperacaoPanel.tsx`
- Create: `tests/integration/regua-cobranca-individual.test.ts`

**Interfaces:**
- Produces: criar, editar, pausar, restaurar e enviar etapas futuras com `conteudo` persistido.

- [ ] **Step 1: Testar estados imutáveis, datas passadas, pausa, restauração e concorrência**
- [ ] **Step 2: Confirmar falhas**
- [ ] **Step 3: Generalizar dispatch sem quebrar D−5/D0/D+3 existentes**
- [ ] **Step 4: Rodar testes unitários, integração e UI**
- [ ] **Step 5: Commit `feat: controlar régua por fatura`**

### Task 4: Cliente privado do ERP e fila fiscal

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261117xxxxxx_nfse_dispatch/migration.sql`
- Create: `src/lib/erp-nfse.ts`
- Create: `src/lib/fila-nfse.ts`
- Create: `tests/unit/erp-nfse.test.ts`
- Create: `tests/integration/fila-nfse.test.ts`

**Interfaces:**
- Consumes: API privada do plano P003 e `ERP_SERVICE_KEY` do cofre.
- Produces: `agendarEmissaoNfse`, `processarFilaNfse`, `consultarNfse`, `cancelarNfse`.

- [ ] **Step 1: Testar redaction, idempotência, backoff, estado incerto, tenant e respostas inválidas**
- [ ] **Step 2: Confirmar testes vermelhos**
- [ ] **Step 3: Implementar cliente server-only e fila persistente com claim concorrente**
- [ ] **Step 4: Rodar testes e confirmar que segredos não aparecem nos logs**
- [ ] **Step 5: Commit `feat: integrar fila fiscal ao ERP`**

### Task 5: Emissão automática após pagamento

**Files:**
- Modify: `src/lib/assinaturas.ts`
- Modify: `src/app/api/webhooks/mercadopago/route.ts`
- Create: `src/app/api/internal/billing/nfse/route.ts`
- Create: `tests/integration/nfse-apos-pagamento.test.ts`
- Create: `tests/unit/nfse-internal-route.test.ts`

**Interfaces:**
- Consumes: `agendarEmissaoNfse` e `processarFilaNfse`.
- Produces: comando fiscal atômico com a baixa e endpoint autenticado para relógio n8n.

- [ ] **Step 1: Testar pagamento, reenvio de webhook, emissão desligada, PF dispensado e falha do ERP**
- [ ] **Step 2: Confirmar falhas**
- [ ] **Step 3: Enfileirar na mesma transação da baixa e expor processador interno**
- [ ] **Step 4: Rodar suítes Mercado Pago, ledger e fiscal**
- [ ] **Step 5: Commit `feat: emitir NFS-e após confirmação do pagamento`**

### Task 6: Controle fiscal na ficha do cliente

**Files:**
- Create: `src/app/api/billing/faturas/[id]/nfse/route.ts`
- Create: `src/app/api/billing/faturas/[id]/nfse/cancelar/route.ts`
- Modify: `src/app/clientes/[id]/page.tsx`
- Modify: `src/components/OperacaoPanel.tsx`
- Create: `tests/unit/nfse-fatura-ui.test.tsx`
- Create: `tests/integration/nfse-fatura-route.test.ts`

**Interfaces:**
- Consumes: fila fiscal da Task 4.
- Produces: emissão manual, atualização, XML via proxy seguro, status e cancelamento com justificativa.

- [ ] **Step 1: Testar permissões, estados, emissão duplicada, download e cancelamento**
- [ ] **Step 2: Confirmar testes vermelhos**
- [ ] **Step 3: Implementar rotas e painel fiscal por fatura**
- [ ] **Step 4: Rodar testes e Playwright responsivo**
- [ ] **Step 5: Commit `feat: controlar NFS-e pela ficha do cliente`**

### Task 7: Automação, documentação e publicação

**Files:**
- Modify: `docs/blueprint-pagamentos-tesouraria.md`
- Modify: `.env.example`
- Modify: workflow n8n existente `rr8tZcE5xDd2eAiT` ou criar relógio fiscal dedicado.

**Interfaces:**
- Consumes: endpoint interno da Task 5 e P003 homologado.
- Produces: processamento recorrente, runbook e evidência de produção.

- [ ] **Step 1: Configurar credencial ERP exclusiva e relógio de cinco minutos sem expor token**
- [ ] **Step 2: Rodar testes completos, lint, TypeScript, build, Prisma migrate e drift**
- [ ] **Step 3: Publicar P003 com emissão de produção desligada e validar API privada**
- [ ] **Step 4: Publicar app, criar cobrança controlada e validar fila sem emissão fiscal real**
- [ ] **Step 5: Ativar produção fiscal somente após evidência da Produção Restrita e autorização operacional**
- [ ] **Step 6: Commit `docs: registrar cobrança personalizada e NFS-e`**

