-- Comissão sobre as vendas, combinada junto com a mensalidade.
--
-- A Vedashow paga a mensalidade da loja e mais 5% sobre o que vender por ela
-- (acordo de 09/10/2026). A assinatura só sabia guardar o valor fixo; o
-- percentual vivia fora do sistema. Ele passa a morar na própria assinatura,
-- que é onde a condição comercial daquele cliente está escrita.
--
-- Aditivo: coluna nova, nula para quem não tem comissão. Nenhuma fatura nasce
-- deste campo; ele registra o combinado e aparece na ficha do cliente.

ALTER TABLE "operations"."subscriptions"
    ADD COLUMN IF NOT EXISTS "sales_commission_percent" DECIMAL(5, 2);

ALTER TABLE "operations"."subscriptions"
    DROP CONSTRAINT IF EXISTS "subscriptions_sales_commission_percent_check";
ALTER TABLE "operations"."subscriptions"
    ADD CONSTRAINT "subscriptions_sales_commission_percent_check"
    CHECK ("sales_commission_percent" IS NULL OR ("sales_commission_percent" > 0 AND "sales_commission_percent" <= 100));
