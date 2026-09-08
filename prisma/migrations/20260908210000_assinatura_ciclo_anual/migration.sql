-- Ciclo da assinatura: mensal (como era) ou anual.
--
-- Serviço pago adiantado por ano — e-mail e domínio são os casos — não cabia
-- no modelo, que só tinha `billing_day` e portanto era mensal por construção.
-- Gravar o valor do ano num campo lido como mensal mentiria duas vezes: a tela
-- mostraria "R$ 480,00/mês" e o MRR contaria doze vezes o que entra uma.
--
-- O DEFAULT preserva o que já existe: toda assinatura de hoje é mensal.
ALTER TABLE "operations"."subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_cycle" TEXT NOT NULL DEFAULT 'MONTHLY';
