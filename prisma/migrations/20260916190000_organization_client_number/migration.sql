-- Número único do cliente: 6 dígitos a partir de 100001, o mesmo em CRM,
-- portal, cobrança, contratos, infraestrutura e atendimento. O `id` (cuid)
-- continua sendo a chave interna; o número é só o nome público da organização.
-- Nunca é alterado nem reaproveitado, e buracos na sequência são esperados
-- (um insert que falha consome o número).
CREATE SEQUENCE "operations"."organizations_client_number_seq"
  AS INTEGER START WITH 100001 MINVALUE 100001 MAXVALUE 999999 NO CYCLE;

ALTER TABLE "operations"."organizations" ADD COLUMN "client_number" INTEGER;

-- A própria Avila Ops é a 100001; as demais seguem a ordem de cadastro.
WITH ordem AS (
  SELECT "id", ROW_NUMBER() OVER (
    ORDER BY ("slug" = 'avila.inc') DESC, "created_at", "id"
  ) AS posicao
  FROM "operations"."organizations"
)
UPDATE "operations"."organizations" o
SET "client_number" = 100000 + ordem.posicao
FROM ordem
WHERE o."id" = ordem."id";

SELECT setval(
  '"operations"."organizations_client_number_seq"',
  COALESCE((SELECT MAX("client_number") FROM "operations"."organizations"), 100001),
  EXISTS (SELECT 1 FROM "operations"."organizations")
);

ALTER TABLE "operations"."organizations"
  ALTER COLUMN "client_number" SET DEFAULT nextval('"operations"."organizations_client_number_seq"'),
  ALTER COLUMN "client_number" SET NOT NULL;

-- A sequência precisa ter o mesmo dono da tabela para ser vinculada a ela.
-- Em produção o dono é o app_avila e este DDL roda como postgres; sem trocar o
-- dono, o app leva permission denied na primeira organização nova.
DO $$
DECLARE dono TEXT;
BEGIN
  SELECT tableowner INTO dono FROM pg_tables
  WHERE schemaname = 'operations' AND tablename = 'organizations';
  EXECUTE format('ALTER SEQUENCE "operations"."organizations_client_number_seq" OWNER TO %I', dono);
END $$;

ALTER SEQUENCE "operations"."organizations_client_number_seq"
  OWNED BY "operations"."organizations"."client_number";

CREATE UNIQUE INDEX "organizations_client_number_key"
  ON "operations"."organizations"("client_number");
