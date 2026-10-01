-- CreateSchema
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateTable
CREATE TABLE "core"."identity_links" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."memberships" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "usage_kind" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "source" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."product_access" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."external_accounts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT,
    "observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "authorized_by_id" TEXT,
    "credential_id" TEXT,
    "legacy_connection_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorized_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."external_assets" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_account_id" TEXT,
    "owner_organization_id" TEXT,
    "ownership_evidence" TEXT,
    "display_name" TEXT,
    "source" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."asset_grants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "connection_id" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."sync_states" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "last_attempt_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "stale_after_seconds" INTEGER NOT NULL DEFAULT 3600,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "error_code" TEXT,

    CONSTRAINT "sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."contracts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT,
    "plan_id" TEXT,
    "legacy_subscription_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "billing_cycle" TEXT NOT NULL,
    "billing_day" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "terms_version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."invoice_ledger_links" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "ledger_entry_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "invoice_ledger_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(3),
    "source" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."inbox_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "locked_by" TEXT,
    "lease_token" TEXT,
    "last_error_code" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."outbox_events" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "deduplication_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "locked_by" TEXT,
    "lease_token" TEXT,
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."audit_events" (
    "id" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "database_role" TEXT NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."reconciliation_issues" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "reconciliation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_links_identity_id_idx" ON "core"."identity_links"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_issuer_subject_key" ON "core"."identity_links"("issuer", "subject");

-- CreateIndex
CREATE INDEX "memberships_organization_id_status_idx" ON "core"."memberships"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_identity_id_organization_id_key" ON "core"."memberships"("identity_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_id_organization_id_key" ON "core"."memberships"("id", "organization_id");

-- CreateIndex
CREATE INDEX "products_organization_id_status_idx" ON "core"."products"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_key_tenant_id_environment_key" ON "core"."products"("product_key", "tenant_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "products_id_organization_id_key" ON "core"."products"("id", "organization_id");

-- CreateIndex
CREATE INDEX "product_access_organization_id_idx" ON "core"."product_access"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_access_membership_id_product_id_key" ON "core"."product_access"("membership_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounts_provider_namespace_external_id_key" ON "core"."external_accounts"("provider", "namespace", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "connections_legacy_connection_id_key" ON "core"."connections"("legacy_connection_id");

-- CreateIndex
CREATE INDEX "connections_organization_id_status_idx" ON "core"."connections"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "connections_id_organization_id_key" ON "core"."connections"("id", "organization_id");

-- CreateIndex
CREATE INDEX "external_assets_owner_organization_id_idx" ON "core"."external_assets"("owner_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_assets_provider_namespace_kind_external_id_key" ON "core"."external_assets"("provider", "namespace", "kind", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_grants_organization_id_asset_id_key" ON "core"."asset_grants"("organization_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_connection_id_resource_key" ON "core"."sync_states"("connection_id", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_legacy_subscription_id_key" ON "core"."contracts"("legacy_subscription_id");

-- CreateIndex
CREATE INDEX "contracts_organization_id_status_idx" ON "core"."contracts"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_ledger_links_invoice_id_key" ON "core"."invoice_ledger_links"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_ledger_links_ledger_entry_id_key" ON "core"."invoice_ledger_links"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "core"."payments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_account_external_id_key" ON "core"."payments"("provider", "provider_account", "external_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "core"."payment_allocations"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "core"."payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "inbox_events_status_available_at_idx" ON "core"."inbox_events"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_provider_provider_account_external_id_key" ON "core"."inbox_events"("provider", "provider_account", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_deduplication_key_key" ON "core"."outbox_events"("deduplication_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "core"."outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_occurred_at_idx" ON "core"."audit_events"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_issues_entity_type_entity_id_code_key" ON "core"."reconciliation_issues"("entity_type", "entity_id", "code");

-- AddForeignKey
ALTER TABLE "core"."identity_links" ADD CONSTRAINT "identity_links_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "portal_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."memberships" ADD CONSTRAINT "memberships_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "portal_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."product_access" ADD CONSTRAINT "product_access_membership_id_organization_id_fkey" FOREIGN KEY ("membership_id", "organization_id") REFERENCES "core"."memberships"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."product_access" ADD CONSTRAINT "product_access_product_id_organization_id_fkey" FOREIGN KEY ("product_id", "organization_id") REFERENCES "core"."products"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."connections" ADD CONSTRAINT "connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."connections" ADD CONSTRAINT "connections_external_account_id_fkey" FOREIGN KEY ("external_account_id") REFERENCES "core"."external_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."connections" ADD CONSTRAINT "connections_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "portal_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."connections" ADD CONSTRAINT "connections_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "operations"."platform_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."connections" ADD CONSTRAINT "connections_legacy_connection_id_fkey" FOREIGN KEY ("legacy_connection_id") REFERENCES "operations"."organization_integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_assets" ADD CONSTRAINT "external_assets_external_account_id_fkey" FOREIGN KEY ("external_account_id") REFERENCES "core"."external_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_assets" ADD CONSTRAINT "external_assets_owner_organization_id_fkey" FOREIGN KEY ("owner_organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset_grants" ADD CONSTRAINT "asset_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset_grants" ADD CONSTRAINT "asset_grants_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "core"."external_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset_grants" ADD CONSTRAINT "asset_grants_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "core"."connections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."sync_states" ADD CONSTRAINT "sync_states_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "core"."connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."contracts" ADD CONSTRAINT "contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."contracts" ADD CONSTRAINT "contracts_product_id_organization_id_fkey" FOREIGN KEY ("product_id", "organization_id") REFERENCES "core"."products"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."contracts" ADD CONSTRAINT "contracts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "operations"."service_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."contracts" ADD CONSTRAINT "contracts_legacy_subscription_id_fkey" FOREIGN KEY ("legacy_subscription_id") REFERENCES "operations"."subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."invoice_ledger_links" ADD CONSTRAINT "invoice_ledger_links_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "operations"."subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."invoice_ledger_links" ADD CONSTRAINT "invoice_ledger_links_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "finance"."ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "core"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "operations"."subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
