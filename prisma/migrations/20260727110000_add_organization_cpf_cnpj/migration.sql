ALTER TABLE "operations"."organizations"
  ADD COLUMN IF NOT EXISTS "cpf_cnpj" TEXT,
  ADD COLUMN IF NOT EXISTS "cnpj_data" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_cpf_cnpj_key"
  ON "operations"."organizations" ("cpf_cnpj");
