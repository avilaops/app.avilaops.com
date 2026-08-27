-- Newsletter: contatos, campanhas e entrega por destinatário.
--
-- Escrito à mão e só aditivo, como manda docs/BANCO-COMPARTILHADO.md: este
-- banco é compartilhado com o portal do cliente, e DDL gerado automaticamente
-- já emitiu DROP de FK de projeto vizinho aqui.

-- CreateTable
CREATE TABLE IF NOT EXISTS "operations"."newsletter_contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "organization_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'SUBSCRIBED',
    "last_seen_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_contacts_pkey" PRIMARY KEY ("id"),
    -- O e-mail é a identidade do contato em todo o módulo (dedupe na
    -- importação, descadastro, chave da entrega). Guardar em minúsculo é o
    -- que faz "Nicolas@" e "nicolas@" serem a mesma pessoa.
    CONSTRAINT "newsletter_contacts_email_lower_check" CHECK ("email" = lower("email")),
    CONSTRAINT "newsletter_contacts_status_check"
      CHECK ("status" IN ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED'))
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_contacts_email_key"
    ON "operations"."newsletter_contacts"("email");
CREATE INDEX IF NOT EXISTS "newsletter_contacts_status_created_at_idx"
    ON "operations"."newsletter_contacts"("status", "created_at");
CREATE INDEX IF NOT EXISTS "newsletter_contacts_organization_id_idx"
    ON "operations"."newsletter_contacts"("organization_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "operations"."newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview_text" TEXT,
    "format" TEXT NOT NULL DEFAULT 'HTML',
    "html" TEXT,
    "text" TEXT,
    "image_url" TEXT,
    "image_alt" TEXT,
    "image_link_url" TEXT,
    "audience_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "newsletter_campaigns_format_check"
      CHECK ("format" IN ('HTML', 'TEXT', 'IMAGE')),
    CONSTRAINT "newsletter_campaigns_status_check"
      CHECK ("status" IN ('DRAFT', 'SENDING', 'SENT', 'FAILED'))
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "newsletter_campaigns_status_created_at_idx"
    ON "operations"."newsletter_campaigns"("status", "created_at");

-- CreateTable
CREATE TABLE IF NOT EXISTS "operations"."newsletter_deliveries" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "newsletter_deliveries_status_check"
      CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED'))
);

-- CreateIndex
-- Um destinatário aparece uma única vez por campanha: é esta chave que
-- transforma "reenviar depois da falha" em retomada, e não em e-mail dobrado.
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_deliveries_campaign_id_email_key"
    ON "operations"."newsletter_deliveries"("campaign_id", "email");
CREATE INDEX IF NOT EXISTS "newsletter_deliveries_campaign_id_status_idx"
    ON "operations"."newsletter_deliveries"("campaign_id", "status");

-- AddForeignKey
ALTER TABLE "operations"."newsletter_contacts"
    DROP CONSTRAINT IF EXISTS "newsletter_contacts_organization_id_fkey";
ALTER TABLE "operations"."newsletter_contacts"
    ADD CONSTRAINT "newsletter_contacts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operations"."newsletter_deliveries"
    DROP CONSTRAINT IF EXISTS "newsletter_deliveries_campaign_id_fkey";
ALTER TABLE "operations"."newsletter_deliveries"
    ADD CONSTRAINT "newsletter_deliveries_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "operations"."newsletter_campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operations"."newsletter_deliveries"
    DROP CONSTRAINT IF EXISTS "newsletter_deliveries_contact_id_fkey";
ALTER TABLE "operations"."newsletter_deliveries"
    ADD CONSTRAINT "newsletter_deliveries_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "operations"."newsletter_contacts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
