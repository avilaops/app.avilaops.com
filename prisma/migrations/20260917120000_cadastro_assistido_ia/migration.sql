-- Fila de revisão do assistente de cadastro.
--
-- Nem a consulta de CNPJ nem a IA escrevem direto na ficha do cliente: cada
-- campo proposto entra aqui como PENDING e só vira dado quando uma pessoa
-- aprova, com autor e horário registrados. É o que torna auditável um dado
-- que não foi digitado por ninguém.
--
-- `request_id` casa com ai_core.ai_core_telemetry.request_id quando a origem
-- é IA: dá para sair de um texto gravado na ficha e chegar na chamada que o
-- produziu, com modelo, tokens, custo e latência.
--
-- Aditivo e idempotente: cria tabela nova, não altera nenhuma existente. Nomes
-- de tabela, colunas, índices e chaves são os que o Prisma geraria a partir do
-- schema; os CHECK são guarda de banco, que o schema não representa.

CREATE TABLE IF NOT EXISTS "operations"."organization_registration_suggestions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "suggested_value" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIA',
    "rationale" TEXT,
    "request_id" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_registration_suggestions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_registration_suggestions_origin_check"
      CHECK ("origin" IN ('RECEITA_FEDERAL', 'IA')),
    CONSTRAINT "organization_registration_suggestions_confidence_check"
      CHECK ("confidence" IN ('ALTA', 'MEDIA', 'BAIXA')),
    CONSTRAINT "organization_registration_suggestions_status_check"
      CHECK ("status" IN ('PENDING', 'APPLIED', 'DISCARDED', 'STALE'))
);

CREATE INDEX IF NOT EXISTS "organization_registration_suggestions_organization_id_statu_idx"
    ON "operations"."organization_registration_suggestions" ("organization_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "organization_registration_suggestions_status_created_at_idx"
    ON "operations"."organization_registration_suggestions" ("status", "created_at");

-- A ficha apagada leva junto as sugestões que esperavam decisão sobre ela.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_registration_suggestions_organization_id_fkey'
  ) THEN
    ALTER TABLE "operations"."organization_registration_suggestions"
      ADD CONSTRAINT "organization_registration_suggestions_organization_id_fkey"
      FOREIGN KEY ("organization_id")
      REFERENCES "operations"."organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Em produção o dono das tabelas é o app_avila e este DDL roda como postgres;
-- sem o grant, o app leva permission denied na primeira sugestão gerada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA "operations" TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "operations"."organization_registration_suggestions" TO app_avila;
  END IF;
END $$;
