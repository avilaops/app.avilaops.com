-- Escopo pessoal x empresa no extrato, e moeda/escopo nas contas a pagar.
--
-- Aditivo e idempotente, como manda docs/plataforma/BANCO-COMPARTILHADO.md:
-- este Postgres é compartilhado com o portal do cliente, a tabela
-- `_prisma_migrations` pertence ao vizinho, e o DDL aqui é aplicado à mão com
-- `--single-transaction -v ON_ERROR_STOP=1`. Nada de DROP, nada de recriar FK.

ALTER TABLE "finance"."bank_transactions"
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'INDEFINIDO',
  ADD COLUMN IF NOT EXISTS "scope_source" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT;

CREATE INDEX IF NOT EXISTS "bank_transactions_scope_occurred_at_idx"
  ON "finance"."bank_transactions" ("scope", "occurred_at");

ALTER TABLE "finance"."ledger_entries"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'EMPRESA';

CREATE INDEX IF NOT EXISTS "ledger_entries_scope_status_due_date_idx"
  ON "finance"."ledger_entries" ("scope", "status", "due_date");
