ALTER TABLE "operations"."organization_web_presence"
  ADD COLUMN IF NOT EXISTS "internal_subdomain" TEXT,
  ADD COLUMN IF NOT EXISTS "internal_url" TEXT;
