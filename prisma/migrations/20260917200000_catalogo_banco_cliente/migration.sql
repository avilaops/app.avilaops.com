-- Catálogo do banco de dados que o cliente opera (ERP, PDV, legado).
--
-- O primeiro caso é o ProCommerce da Vedashow: 258 tabelas em SQL Server 2008,
-- sem documentação, de onde sai o cadastro de produtos da loja virtual. Até
-- aqui o que se sabia da estrutura vivia em conversa e em arquivo solto.
--
-- O Ávila OS não conecta no banco do cliente — o servidor de produção não está
-- na rede dele. A estrutura chega por POST /api/organizations/:id/bancos/sync,
-- enviada por um script que roda onde há acesso. `description` é o único campo
-- que a sincronização nunca toca: é anotação de gente, não dá para reler.
--
-- Aditivo e idempotente: só cria tabela nova. Nomes de tabela, coluna, índice
-- e chave são os que o Prisma geraria; os CHECK são guarda de banco.

CREATE TABLE IF NOT EXISTS "operations"."client_databases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "engine_version" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "database_name" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "access_notes" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "synced_from" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_databases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_databases_engine_check"
      CHECK ("engine" IN ('SQLSERVER', 'POSTGRES', 'MYSQL', 'FIREBIRD', 'ORACLE', 'OUTRO')),
    CONSTRAINT "client_databases_environment_check"
      CHECK ("environment" IN ('PRODUCTION', 'TEST'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_databases_organization_id_key_key"
    ON "operations"."client_databases" ("organization_id", "key");

CREATE TABLE IF NOT EXISTS "operations"."client_database_tables" (
    "id" TEXT NOT NULL,
    "database_id" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "row_count" BIGINT,
    "description" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_database_tables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_database_tables_database_id_schema_name_name_key"
    ON "operations"."client_database_tables" ("database_id", "schema_name", "name");

CREATE INDEX IF NOT EXISTS "client_database_tables_database_id_row_count_idx"
    ON "operations"."client_database_tables" ("database_id", "row_count");

CREATE TABLE IF NOT EXISTS "operations"."client_database_columns" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "nullable" BOOLEAN NOT NULL,
    "is_primary_key" BOOLEAN NOT NULL DEFAULT false,
    "references_table" TEXT,
    "references_column" TEXT,
    "filled_count" BIGINT,
    "distinct_count" BIGINT,
    "min_value" TEXT,
    "max_value" TEXT,
    "description" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_database_columns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_database_columns_table_id_name_key"
    ON "operations"."client_database_columns" ("table_id", "name");

-- A busca da tela é por nome de coluna atravessando todas as tabelas.
CREATE INDEX IF NOT EXISTS "client_database_columns_name_idx"
    ON "operations"."client_database_columns" ("name");

-- Cliente apagado leva o catálogo; banco apagado leva tabelas e colunas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_databases_organization_id_fkey') THEN
    ALTER TABLE "operations"."client_databases"
      ADD CONSTRAINT "client_databases_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_database_tables_database_id_fkey') THEN
    ALTER TABLE "operations"."client_database_tables"
      ADD CONSTRAINT "client_database_tables_database_id_fkey"
      FOREIGN KEY ("database_id") REFERENCES "operations"."client_databases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_database_columns_table_id_fkey') THEN
    ALTER TABLE "operations"."client_database_columns"
      ADD CONSTRAINT "client_database_columns_table_id_fkey"
      FOREIGN KEY ("table_id") REFERENCES "operations"."client_database_tables"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Em produção o dono das tabelas é o app_avila e este DDL roda como postgres;
-- sem o grant, a primeira sincronização leva permission denied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA "operations" TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "operations"."client_databases",
      "operations"."client_database_tables",
      "operations"."client_database_columns"
      TO app_avila;
  END IF;
END $$;
