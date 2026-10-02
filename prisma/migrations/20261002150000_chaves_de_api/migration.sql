-- Chaves de API para automações e agentes falarem com o painel sem cookie.
--
-- Aditiva: tabela nova, nada é alterado nem removido. O segredo nunca entra no
-- banco; só o SHA-256 dele e o prefixo para reconhecer a chave na lista.
CREATE TABLE IF NOT EXISTS "operations"."api_keys" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "escopos" TEXT[],
    "criada_por" TEXT NOT NULL,
    "ultimo_uso_em" TIMESTAMP(3),
    "expira_em" TIMESTAMP(3),
    "revogada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefixo_key" ON "operations"."api_keys"("prefixo");
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_key" ON "operations"."api_keys"("hash");
CREATE INDEX IF NOT EXISTS "api_keys_criada_por_idx" ON "operations"."api_keys"("criada_por");
