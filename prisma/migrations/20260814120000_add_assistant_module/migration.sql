-- Assistente com recuperação de contexto, escopado por tenant.
-- Escrita à mão e estritamente aditiva: nenhuma tabela existente é tocada.
--
-- Decisão de projeto: a recuperação nasce em BUSCA TEXTUAL do Postgres
-- (tsvector com dicionário português + trigrama), não em embeddings.
-- Motivos, nesta ordem:
--   1. O corpus é pequeno (87 documentos, ~85 mil palavras). Busca textual bem
--      feita compete com vetor nessa escala.
--   2. pgvector não está instalado em produção nem localmente. Adicionar
--      dependência de extensão em dois ambientes por ganho incerto é caro.
--   3. Indexar por embedding exigiria enviar documento de cliente para a
--      OpenAI. Com o compartilhamento de dados ligado na conta, isso viraria
--      material de treino — conflito direto com a Política de Segurança.
-- A coluna de vetor pode ser acrescentada depois sem refazer nada: as tabelas,
-- o recorte em trechos e o filtro de escopo continuam valendo.

-- CreateTable
CREATE TABLE "ai_core"."assistant_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "source" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "indexed_at" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_core"."assistant_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_core"."assistant_conversations" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "title" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_core"."assistant_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_documents_scope_organization_id_path_key"
  ON "ai_core"."assistant_documents"("scope", "organization_id", "path");
CREATE INDEX "assistant_documents_scope_organization_id_idx"
  ON "ai_core"."assistant_documents"("scope", "organization_id");
CREATE INDEX "assistant_documents_content_hash_idx"
  ON "ai_core"."assistant_documents"("content_hash");

CREATE UNIQUE INDEX "assistant_chunks_document_id_ordinal_key"
  ON "ai_core"."assistant_chunks"("document_id", "ordinal");
CREATE INDEX "assistant_chunks_scope_organization_id_idx"
  ON "ai_core"."assistant_chunks"("scope", "organization_id");

CREATE INDEX "assistant_conversations_actor_id_last_message_at_idx"
  ON "ai_core"."assistant_conversations"("actor_id", "last_message_at");

CREATE INDEX "assistant_messages_conversation_id_criado_em_idx"
  ON "ai_core"."assistant_messages"("conversation_id", "criado_em");

-- AddForeignKey
-- O documento some junto com a organização; o trecho some junto com o
-- documento. Nada de órfão de cliente removido.
ALTER TABLE "ai_core"."assistant_documents"
  ADD CONSTRAINT "assistant_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_core"."assistant_chunks"
  ADD CONSTRAINT "assistant_chunks_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "ai_core"."assistant_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_core"."assistant_messages"
  ADD CONSTRAINT "assistant_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_core"."assistant_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Coerência de escopo: trecho de cliente precisa ter organização, e trecho
-- global não pode ter. Sem isso, um erro de ingestão vira vazamento silencioso
-- entre tenants — o filtro da consulta passaria, mas o dado estaria no balde
-- errado.
ALTER TABLE "ai_core"."assistant_documents"
  ADD CONSTRAINT "assistant_documents_scope_coerente"
  CHECK (
    ("scope" = 'GLOBAL' AND "organization_id" IS NULL)
    OR ("scope" = 'TENANT' AND "organization_id" IS NOT NULL)
  );

ALTER TABLE "ai_core"."assistant_chunks"
  ADD CONSTRAINT "assistant_chunks_scope_coerente"
  CHECK (
    ("scope" = 'GLOBAL' AND "organization_id" IS NULL)
    OR ("scope" = 'TENANT' AND "organization_id" IS NOT NULL)
  );

-- Busca textual em português, gerada pelo próprio banco a partir do conteúdo.
-- Coluna gerada em vez de trigger: não há como esquecer de atualizar.
ALTER TABLE "ai_core"."assistant_chunks"
  ADD COLUMN "busca" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce("heading", '')), 'A') ||
    setweight(to_tsvector('portuguese', "content"), 'B')
  ) STORED;

CREATE INDEX "assistant_chunks_busca_idx"
  ON "ai_core"."assistant_chunks" USING GIN ("busca");

-- Trigrama para tolerar erro de digitação e busca por trecho de palavra,
-- onde a busca textual sozinha não acerta.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "assistant_chunks_content_trgm_idx"
  ON "ai_core"."assistant_chunks" USING GIN ("content" gin_trgm_ops);

-- Grants mínimos para o role da aplicação, no padrão condicional das
-- migrations anteriores.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA ai_core TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_core.assistant_documents TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_core.assistant_chunks TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_core.assistant_conversations TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_core.assistant_messages TO app_avila;
  END IF;
END $$;
