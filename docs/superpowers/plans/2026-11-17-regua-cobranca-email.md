# Régua automática de cobrança por e-mail • Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar automaticamente D−5, D0 e D+3, com uma repetição após falha e cancelamento ao pagar ou cancelar.

**Architecture:** Fila persistente no Postgres, processador idempotente no app e n8n usado somente como relógio. O processador reutiliza a composição e a entrega já testadas e grava auditoria em dois tempos.

**Tech Stack:** Next.js 16 • TypeScript • Prisma 6 • PostgreSQL • Vitest • n8n

**Spec:** `docs/superpowers/specs/2026-11-17-regua-cobranca-email-design.md`

## Global Constraints

• Fuso `America/Sao_Paulo` e horário 09:00.  
• Etapas fixas D−5 `fatura`, D0 e D+3 `ambos`.  
• No máximo duas tentativas, com 30 minutos entre elas.  
• Não enviar fatura paga ou cancelada nem item atrasado mais de 24 horas.  
• Preservar a proteção de saldo e cobrança ativa de `entrega-cobranca.ts`.  
• Usar `•` em rótulos e textos do produto.

## Review Focus

• Dois workers simultâneos não podem reivindicar o mesmo item.  
• Pagamento entre a reivindicação e o envio deve recusar a mensagem.  
• Reinício após falha deve liberar o item pelo prazo da reivindicação.  
• Job atrasado não pode enviar três mensagens antigas em sequência.  
• Falha da auditoria antes do envio deve impedir contato externo.

---

### Task 1: Modelo persistente da fila

**Files:**
• Modify: `prisma/schema.prisma`  
• Create: `prisma/migrations/20261117120000_billing_email_dispatches/migration.sql`  
• Test: `tests/unit/regua-cobranca-email.test.ts`

**Interfaces:**
• Produces: modelo `BillingEmailDispatch`, unicidade `invoiceId + stage` e índices de processamento.

- [ ] Escrever teste da derivação das três datas e da janela de 24 horas.
- [ ] Confirmar falha do teste.
- [ ] Criar migration e modelo Prisma.
- [ ] Implementar funções puras de datas e estágios em `src/lib/regua-cobranca-email.ts`.
- [ ] Confirmar passagem do teste.

### Task 2: Reconciliação, reivindicação e envio auditado

**Files:**
• Modify: `src/lib/regua-cobranca-email.ts`  
• Modify: `src/lib/entrega-cobranca.ts`  
• Test: `tests/unit/regua-cobranca-email.test.ts`

**Interfaces:**
• Consumes: `BillingEmailDispatch` e `enviarCobrancaPorEmail`.  
• Produces: `processarReguaDeCobranca(agora?: Date, limite?: number)` com resumo determinístico.

- [ ] Escrever testes de idempotência, estados finais, repetição única e item antigo.
- [ ] Confirmar falhas.
- [ ] Implementar reconciliação das etapas e cancelamento de pendências finais.
- [ ] Implementar reivindicação atômica com prazo e lote.
- [ ] Reutilizar envio e gravar intenção/desfecho com origem automática.
- [ ] Confirmar passagem dos testes.

### Task 3: Rota interna e observabilidade

**Files:**
• Create: `src/app/api/internal/billing/email-reminders/route.ts`  
• Test: `tests/unit/regua-cobranca-email-route.test.ts`

**Interfaces:**
• Consumes: `isServiceCall` e `processarReguaDeCobranca`.  
• Produces: `POST` autenticado por `x-service-key`, com contadores sem dados pessoais.

- [ ] Escrever testes de 401 e resposta do processador.
- [ ] Confirmar falhas.
- [ ] Implementar rota Node.js sem sessão de navegador.
- [ ] Confirmar passagem dos testes.

### Task 4: Estado e cancelamento na ficha do cliente

**Files:**
• Modify: `src/app/clientes/[id]/page.tsx`  
• Modify: `src/components/OperacaoPanel.tsx`  
• Create: `src/app/api/billing/faturas/[id]/lembretes/[dispatchId]/route.ts`  
• Test: `tests/unit/regua-cobranca-email-ui.test.tsx`

**Interfaces:**
• Consumes: relação `emailDispatches`.  
• Produces: três estados visíveis e `DELETE` para cancelar somente item pendente.

- [ ] Escrever teste do estado exibido e autorização do cancelamento.
- [ ] Confirmar falhas.
- [ ] Carregar os itens junto das faturas.
- [ ] Renderizar estados e ação de cancelamento.
- [ ] Implementar rota somente para dono, mesma origem e item pendente.
- [ ] Confirmar passagem dos testes.

### Task 5: Automação n8n, documentação e verificação

**Files:**
• Modify: `docs/blueprint-pagamentos-tesouraria.md`

**Interfaces:**
• Consumes: `POST /api/internal/billing/email-reminders`.  
• Produces: workflow n8n ativo a cada 30 minutos com a credencial de serviço existente.

- [ ] Criar workflow n8n pelo SDK oficial e validar antes de publicar.
- [ ] Atualizar o blueprint com régua, limites e operação.
- [ ] Rodar testes unitários, lint, Prisma validate e build.
- [ ] Aplicar migration e publicar o app.
- [ ] Executar a rota em produção sem itens artificiais e conferir resumo/logs.

