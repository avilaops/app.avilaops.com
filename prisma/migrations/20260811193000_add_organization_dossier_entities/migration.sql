CREATE TABLE IF NOT EXISTS "operations"."organization_contacts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'OWNER',
  "name" TEXT NOT NULL,
  "role" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "best_contact_time" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "organization_contacts_organization_id_type_idx" ON "operations"."organization_contacts"("organization_id", "type");

CREATE TABLE IF NOT EXISTS "operations"."organization_addresses" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MAIN',
  "postal_code" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT DEFAULT 'Brasil',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT DEFAULT 'MANUAL',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "organization_addresses_organization_id_type_idx" ON "operations"."organization_addresses"("organization_id", "type");

CREATE TABLE IF NOT EXISTS "operations"."organization_social_profiles" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "identifier" TEXT,
  "url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_social_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_social_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_social_profiles_organization_id_platform_key" ON "operations"."organization_social_profiles"("organization_id", "platform");
CREATE INDEX IF NOT EXISTS "organization_social_profiles_platform_status_idx" ON "operations"."organization_social_profiles"("platform", "status");

CREATE TABLE IF NOT EXISTS "operations"."organization_files" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "storage_key" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "version" TEXT DEFAULT '1',
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "uploaded_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "organization_files_organization_id_category_idx" ON "operations"."organization_files"("organization_id", "category");

CREATE TABLE IF NOT EXISTS "operations"."organization_onboarding_steps" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "step_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "due_date" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "notes" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_onboarding_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_onboarding_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_onboarding_steps_organization_id_step_key_key" ON "operations"."organization_onboarding_steps"("organization_id", "step_key");
CREATE INDEX IF NOT EXISTS "organization_onboarding_steps_organization_id_status_sort_order_idx" ON "operations"."organization_onboarding_steps"("organization_id", "status", "sort_order");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "operations"."organization_contacts" TO "app_avila";
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "operations"."organization_addresses" TO "app_avila";
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "operations"."organization_social_profiles" TO "app_avila";
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "operations"."organization_files" TO "app_avila";
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "operations"."organization_onboarding_steps" TO "app_avila";
  END IF;
END $$;
