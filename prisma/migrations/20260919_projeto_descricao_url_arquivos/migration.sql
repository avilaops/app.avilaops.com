-- Projeto ganha descricao, link principal e midia (imagem, PDF, video).
ALTER TABLE "operations"."projects" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "operations"."projects" ADD COLUMN IF NOT EXISTS "url" TEXT;

CREATE TABLE IF NOT EXISTS "operations"."project_files" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'outro',
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "notes" TEXT,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_files_project_id_created_at_idx"
  ON "operations"."project_files"("project_id", "created_at");

ALTER TABLE "operations"."project_files"
  ADD CONSTRAINT "project_files_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "operations"."projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
