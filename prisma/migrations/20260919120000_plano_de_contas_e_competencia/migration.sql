-- Plano de contas e competência: o que falta para existir DRE.
--
-- `category` já era escrita pelas regras de escopo ("Domínios",
-- "Infraestrutura", "Contabilidade"…) e nunca foi somada em lugar nenhum —
-- texto livre não vira demonstrativo. `account_code` aponta para a árvore de
-- `src/lib/plano-de-contas.ts`, que é o agrupamento do DRE.
--
-- `competence_start` e `competence_months` separam o fato do pagamento: o
-- domínio anual pago de uma vez é caixa de um mês e despesa de doze. Nulo
-- significa "competência igual ao vencimento", que é como tudo se comportava
-- antes — nenhuma linha existente muda de valor.
--
-- O preenchimento inicial usa o mapa de categorias que o código já aplica, e é
-- escrito em SQL aqui para o primeiro DRE nascer com histórico em vez de
-- nascer vazio. Só toca linha com `account_code` nulo: reclassificação feita à
-- mão nunca é desfeita por reimportação nem por uma segunda execução.
--
-- Aditivo e idempotente.

ALTER TABLE "finance"."ledger_entries"
  ADD COLUMN IF NOT EXISTS "account_code" TEXT,
  ADD COLUMN IF NOT EXISTS "competence_start" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "competence_months" INTEGER;

ALTER TABLE "finance"."bank_transactions"
  ADD COLUMN IF NOT EXISTS "account_code" TEXT;

-- Índices: o DRE varre por escopo e data, e agrupa por conta.
CREATE INDEX IF NOT EXISTS "ledger_entries_account_code_idx"
  ON "finance"."ledger_entries" ("account_code");
CREATE INDEX IF NOT EXISTS "bank_transactions_account_code_idx"
  ON "finance"."bank_transactions" ("account_code");

-- Categorias que as regras já escrevem, na conta correspondente.
UPDATE "finance"."bank_transactions" SET "account_code" = CASE "category"
    WHEN 'Domínios'        THEN '3.2'
    WHEN 'Infraestrutura'  THEN '3.1'
    WHEN 'IA'              THEN '3.3'
    WHEN 'Comunicação'     THEN '3.4'
    WHEN 'Ferramentas'     THEN '4.1'
    WHEN 'Contabilidade'   THEN '4.2'
    WHEN 'Impostos'        THEN '2.1'
  END
  WHERE "account_code" IS NULL
    AND "category" IN ('Domínios','Infraestrutura','IA','Comunicação','Ferramentas','Contabilidade','Impostos');

UPDATE "finance"."ledger_entries" SET "account_code" = CASE "category"
    WHEN 'Domínios'        THEN '3.2'
    WHEN 'Infraestrutura'  THEN '3.1'
    WHEN 'IA'              THEN '3.3'
    WHEN 'Comunicação'     THEN '3.4'
    WHEN 'Ferramentas'     THEN '4.1'
    WHEN 'Contabilidade'   THEN '4.2'
    WHEN 'Impostos'        THEN '2.1'
  END
  WHERE "account_code" IS NULL
    AND "category" IN ('Domínios','Infraestrutura','IA','Comunicação','Ferramentas','Contabilidade','Impostos');

-- Entrada de empresa sem categoria é venda até prova em contrário; saída
-- desconhecida fica a classificar, porque chutar despesa faz o resultado
-- mentir para baixo e ninguém percebe.
UPDATE "finance"."bank_transactions"
  SET "account_code" = CASE WHEN "direction" = 'CREDIT' THEN '1.2' ELSE '9.9' END
  WHERE "account_code" IS NULL AND "scope" = 'EMPRESA';

UPDATE "finance"."ledger_entries"
  SET "account_code" = CASE WHEN "direction" = 'RECEIVABLE' THEN '1.2' ELSE '9.9' END
  WHERE "account_code" IS NULL AND "scope" = 'EMPRESA';
