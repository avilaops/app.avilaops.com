ALTER TABLE "operations"."subscription_charges"
  ADD COLUMN "checkout_url" TEXT;

ALTER TABLE "operations"."subscription_charges"
  ALTER COLUMN "provider" SET DEFAULT 'MERCADO_PAGO';
