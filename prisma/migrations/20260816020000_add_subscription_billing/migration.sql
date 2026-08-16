-- Cobrança recorrente: assinatura, fatura do mês e tentativas de pagamento.
--
-- Escrito à mão e só aditivo, como manda docs/BANCO-COMPARTILHADO.md: este
-- banco é compartilhado com o portal do cliente, e DDL gerado automaticamente
-- já emitiu DROP de FK de projeto vizinho aqui.

-- CreateTable
CREATE TABLE IF NOT EXISTS "operations"."subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "billing_day" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "product_key" TEXT,
    "product_tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    -- 29, 30 e 31 não existem em todo mês. A regra vive no banco também
    -- porque assinatura entra por script, por tela e por importação.
    CONSTRAINT "subscriptions_billing_day_check" CHECK ("billing_day" BETWEEN 1 AND 28)
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "operations"."subscription_invoices" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "operations"."subscription_charges" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'EFI',
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(10,2) NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "interest_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pix_copy_paste" TEXT,
    "pix_qr_base64" TEXT,
    "boleto_url" TEXT,
    "boleto_barcode" TEXT,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_product_key_product_tenant_id_key"
    ON "operations"."subscriptions"("product_key", "product_tenant_id");
CREATE INDEX IF NOT EXISTS "subscriptions_organization_id_status_idx"
    ON "operations"."subscriptions"("organization_id", "status");

-- Faturar a mesma competência duas vezes é o erro que faz ninguém ter coragem
-- de reexecutar o job. O banco recusa.
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_invoices_subscription_id_competence_key"
    ON "operations"."subscription_invoices"("subscription_id", "competence");
CREATE INDEX IF NOT EXISTS "subscription_invoices_status_due_date_idx"
    ON "operations"."subscription_invoices"("status", "due_date");

CREATE INDEX IF NOT EXISTS "subscription_charges_invoice_id_status_idx"
    ON "operations"."subscription_charges"("invoice_id", "status");
-- O webhook da EFI chega com o id externo e mais nada.
CREATE INDEX IF NOT EXISTS "subscription_charges_external_id_idx"
    ON "operations"."subscription_charges"("external_id");

-- AddForeignKey
ALTER TABLE "operations"."subscriptions"
    DROP CONSTRAINT IF EXISTS "subscriptions_organization_id_fkey";
ALTER TABLE "operations"."subscriptions"
    ADD CONSTRAINT "subscriptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operations"."subscription_invoices"
    DROP CONSTRAINT IF EXISTS "subscription_invoices_subscription_id_fkey";
ALTER TABLE "operations"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "operations"."subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operations"."subscription_charges"
    DROP CONSTRAINT IF EXISTS "subscription_charges_invoice_id_fkey";
ALTER TABLE "operations"."subscription_charges"
    ADD CONSTRAINT "subscription_charges_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "operations"."subscription_invoices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Dono das tabelas novas.
--
-- Rodar DDL como `postgres` deixa o `postgres` como dono, e o app leva
-- `permission denied` (42501) na primeira escrita — mesmo com as colunas todas
-- certas. O IF do papel existir é para o banco de desenvolvimento, que não tem
-- os papéis do servidor.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    EXECUTE 'ALTER TABLE "operations"."subscriptions" OWNER TO app_avila';
    EXECUTE 'ALTER TABLE "operations"."subscription_invoices" OWNER TO app_avila';
    EXECUTE 'ALTER TABLE "operations"."subscription_charges" OWNER TO app_avila';
  END IF;
END
$$;

-- CPF de quem responde pela empresa.
--
-- A Efí exige pessoa física no boleto e no cartão mesmo quando o pagador é
-- CNPJ (a empresa entra como `juridical_person`, o responsável como titular).
-- Sem este dado, boleto e cartão não podem ser emitidos.
ALTER TABLE "operations"."organization_profiles"
    ADD COLUMN IF NOT EXISTS "responsible_cpf" TEXT;
