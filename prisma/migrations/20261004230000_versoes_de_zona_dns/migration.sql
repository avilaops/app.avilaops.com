-- Versões de zona de DNS (contrato externo 02 §7 do cliente.avilaops.com:
-- "a zona é editada pelo painel, com histórico de versões e restauração").
--
-- Desde que o cliente edita a própria zona pelo portal, um erro dele derruba
-- o próprio e-mail. A trilha de auditoria guarda a linha mexida; esta tabela
-- guarda a zona inteira depois de cada alteração, que é o que se restaura.
--
-- Aditivo e idempotente: só cria tabela nova. Nomes de tabela, coluna, índice
-- e chave são os que o Prisma geraria.

CREATE TABLE IF NOT EXISTS "operations"."dns_zone_versions" (
    "id" TEXT NOT NULL,
    "domain_asset_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT NOT NULL,
    "records" JSONB NOT NULL,
    "record_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dns_zone_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dns_zone_versions_origin_check" CHECK ("origin" IN ('EQUIPE', 'CLIENTE', 'SISTEMA'))
);

CREATE INDEX IF NOT EXISTS "dns_zone_versions_domain_asset_id_created_at_idx"
    ON "operations"."dns_zone_versions" ("domain_asset_id", "created_at");

-- Domínio apagado leva as versões. Domínio arquivado (status) as mantém.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dns_zone_versions_domain_asset_id_fkey') THEN
    ALTER TABLE "operations"."dns_zone_versions"
      ADD CONSTRAINT "dns_zone_versions_domain_asset_id_fkey"
      FOREIGN KEY ("domain_asset_id") REFERENCES "operations"."domains"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Em produção o dono das tabelas é o app_avila e este DDL roda como postgres.
-- Sem UPDATE de propósito: versão não se edita.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA "operations" TO app_avila;
    GRANT SELECT, INSERT, DELETE ON TABLE "operations"."dns_zone_versions" TO app_avila;
  END IF;
END $$;
