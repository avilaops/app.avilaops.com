-- Estúdio: peças de conteúdo e fila de renderização.
-- Aditivo e idempotente, como manda docs/plataforma/BANCO-COMPARTILHADO.md.

CREATE TABLE IF NOT EXISTS "operations"."studio_pieces" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "format"      TEXT NOT NULL DEFAULT '9:16',
  "values"      JSONB NOT NULL,
  "duration"    DOUBLE PRECISION,
  "narration"   BOOLEAN NOT NULL DEFAULT TRUE,
  "voice"       TEXT NOT NULL DEFAULT 'pm_nicolas',
  "soundtrack"  JSONB,
  "created_by"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "studio_pieces_format_check" CHECK ("format" IN ('9:16', '1:1', '4:5'))
);

CREATE INDEX IF NOT EXISTS "studio_pieces_updated_at_idx" ON "operations"."studio_pieces" ("updated_at");

CREATE TABLE IF NOT EXISTS "operations"."studio_renders" (
  "id"          TEXT PRIMARY KEY,
  "piece_id"    TEXT NOT NULL REFERENCES "operations"."studio_pieces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind"        TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "width"       INTEGER NOT NULL,
  "height"      INTEGER NOT NULL,
  "fps"         INTEGER NOT NULL DEFAULT 24,
  "duration"    DOUBLE PRECISION,
  "snapshot"    JSONB NOT NULL,
  "file_name"   TEXT,
  "mime_type"   TEXT,
  "size_bytes"  INTEGER,
  "log"         TEXT,
  "started_at"  TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "studio_renders_kind_check" CHECK ("kind" IN ('video', 'image')),
  CONSTRAINT "studio_renders_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'DONE', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS "studio_renders_status_created_at_idx" ON "operations"."studio_renders" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "studio_renders_piece_id_created_at_idx" ON "operations"."studio_renders" ("piece_id", "created_at");

ALTER TABLE "operations"."studio_pieces" OWNER TO app_avila;
ALTER TABLE "operations"."studio_renders" OWNER TO app_avila;
