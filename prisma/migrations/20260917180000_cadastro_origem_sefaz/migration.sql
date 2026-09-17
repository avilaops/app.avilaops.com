-- Origem SEFAZ no assistente de cadastro.
--
-- `sefaz_data` guarda o bloco <dest> da NF-e mais recente recebida pelo
-- cliente: o retrato que um fornecedor fez dele. Mesma natureza do
-- `cnpj_data` que a coluna vizinha já guarda — dado do cliente sobre o
-- cliente. Item de nota, fornecedor, valores e XML NÃO entram aqui: são dado
-- fiscal de terceiro, com sigilo e retenção próprios, e não têm por que morar
-- no cadastro comercial.
--
-- O CHECK de `origin` precisa aceitar 'SEFAZ'; sem isto a primeira sugestão
-- da nova origem é recusada pelo banco.
--
-- Aditivo e idempotente.

ALTER TABLE "operations"."organizations"
  ADD COLUMN IF NOT EXISTS "sefaz_data" JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_registration_suggestions_origin_check'
  ) THEN
    ALTER TABLE "operations"."organization_registration_suggestions"
      DROP CONSTRAINT "organization_registration_suggestions_origin_check";
  END IF;

  ALTER TABLE "operations"."organization_registration_suggestions"
    ADD CONSTRAINT "organization_registration_suggestions_origin_check"
    CHECK ("origin" IN ('RECEITA_FEDERAL', 'SEFAZ', 'IA'));
END $$;
