-- Módulo de recrutamento: vagas de jobs.avilaops.com e candidaturas.
-- Escrita à mão e estritamente aditiva: nenhuma tabela existente é tocada.

-- CreateTable
CREATE TABLE "operations"."job_postings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "posted_at" TIMESTAMP(3),
    "valid_through" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."job_applications" (
    "id" TEXT NOT NULL,
    "job_posting_id" TEXT NOT NULL,
    "job_ref" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "links" TEXT,
    "mensagem" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'RECEIVED',
    "rating" INTEGER,
    "source" TEXT,
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "consent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_until" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."job_application_events" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "type" TEXT NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT,
    "note" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."job_application_files" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RESUME',
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_application_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_slug_key" ON "operations"."job_postings"("slug");
CREATE UNIQUE INDEX "job_postings_ref_key" ON "operations"."job_postings"("ref");
CREATE INDEX "job_postings_status_posted_at_idx" ON "operations"."job_postings"("status", "posted_at");
CREATE INDEX "job_postings_area_status_idx" ON "operations"."job_postings"("area", "status");

CREATE INDEX "job_applications_stage_criado_em_idx" ON "operations"."job_applications"("stage", "criado_em");
CREATE INDEX "job_applications_job_posting_id_stage_idx" ON "operations"."job_applications"("job_posting_id", "stage");
CREATE INDEX "job_applications_email_idx" ON "operations"."job_applications"("email");
CREATE INDEX "job_applications_retention_until_idx" ON "operations"."job_applications"("retention_until");

CREATE INDEX "job_application_events_application_id_criado_em_idx" ON "operations"."job_application_events"("application_id", "criado_em");

CREATE INDEX "job_application_files_application_id_idx" ON "operations"."job_application_files"("application_id");

-- AddForeignKey
-- RESTRICT é proposital: apagar vaga com candidatura tem que falhar, não
-- apagar candidato em cascata.
ALTER TABLE "operations"."job_applications"
  ADD CONSTRAINT "job_applications_job_posting_id_fkey"
  FOREIGN KEY ("job_posting_id") REFERENCES "operations"."job_postings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations"."job_application_events"
  ADD CONSTRAINT "job_application_events_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "operations"."job_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operations"."job_application_files"
  ADD CONSTRAINT "job_application_files_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "operations"."job_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrição de publicação.
-- `valid_through > now()` não pode virar CHECK porque `now()` não é imutável;
-- essa metade fica na API (validação na escrita + filtro na leitura). O que dá
-- para garantir no banco é que vaga publicada nunca fique sem as datas que o
-- JSON-LD JobPosting exige — sem elas o Google Jobs rejeita o anúncio.
ALTER TABLE "operations"."job_postings"
  ADD CONSTRAINT "job_postings_published_requires_dates"
  CHECK (
    "status" <> 'PUBLISHED'
    OR ("posted_at" IS NOT NULL AND "valid_through" IS NOT NULL)
  );

-- Grants mínimos para o role da aplicação, no mesmo padrão condicional das
-- migrations anteriores (o role não existe em todo ambiente local).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA operations TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.job_postings TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.job_applications TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.job_application_events TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operations.job_application_files TO app_avila;
  END IF;
END $$;
