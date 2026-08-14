ALTER TABLE "operations"."organization_web_presence"
  ADD COLUMN IF NOT EXISTS "internal_site_status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "internal_site_published_at" TIMESTAMP(3);
