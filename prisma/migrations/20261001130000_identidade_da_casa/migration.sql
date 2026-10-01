-- A identidade da própria Ávila Ops: nome e ícone do topo do painel.
--
-- Aditiva: tabela nova, nada é alterado nem removido. A linha única nasce no
-- primeiro acesso à tela (upsert por id fixo), então a migração não precisa
-- semear nada — e assim ela vale igual em produção e no banco descartável.
CREATE TABLE IF NOT EXISTS "operations"."identidade_da_casa" (
    "id" TEXT NOT NULL DEFAULT 'casa',
    "nome" TEXT NOT NULL DEFAULT 'Ávila Ops',
    "icone_mime" TEXT,
    "icone_dados" BYTEA,
    "icone_versao" TEXT,
    "atualizado_por" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identidade_da_casa_pkey" PRIMARY KEY ("id")
);
