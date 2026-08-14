CREATE SCHEMA IF NOT EXISTS operations;

CREATE TABLE IF NOT EXISTS operations.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    legal_name TEXT,
    segment TEXT,
    site_url TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ONBOARDING', 'PAUSED', 'ARCHIVED')),
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizations_status_created_idx
    ON operations.organizations (status, created_at DESC);

CREATE TABLE IF NOT EXISTS operations.brands (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL
        REFERENCES operations.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
    site_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT brands_organization_slug_key UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS brands_organization_status_idx
    ON operations.brands (organization_id, status);

CREATE TABLE IF NOT EXISTS operations.projects (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL
        REFERENCES operations.organizations(id) ON DELETE CASCADE,
    brand_id TEXT
        REFERENCES operations.brands(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLANNING'
        CHECK (status IN ('PLANNING', 'ACTIVE', 'WAITING', 'COMPLETED', 'CANCELLED')),
    priority TEXT NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    owner_name TEXT,
    starts_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_organization_status_idx
    ON operations.projects (organization_id, status);
CREATE INDEX IF NOT EXISTS projects_brand_status_idx
    ON operations.projects (brand_id, status);
CREATE INDEX IF NOT EXISTS projects_due_status_idx
    ON operations.projects (due_at, status);

CREATE TABLE IF NOT EXISTS operations.tasks (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL
        REFERENCES operations.organizations(id) ON DELETE CASCADE,
    brand_id TEXT
        REFERENCES operations.brands(id) ON DELETE SET NULL,
    project_id TEXT
        REFERENCES operations.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'TODO'
        CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
    priority TEXT NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    owner_name TEXT,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_organization_status_idx
    ON operations.tasks (organization_id, status);
CREATE INDEX IF NOT EXISTS tasks_project_status_idx
    ON operations.tasks (project_id, status);
CREATE INDEX IF NOT EXISTS tasks_due_status_idx
    ON operations.tasks (due_at, status);

CREATE TABLE IF NOT EXISTS operations.approvals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL
        REFERENCES operations.organizations(id) ON DELETE CASCADE,
    project_id TEXT
        REFERENCES operations.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    requested_by TEXT,
    due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approvals_organization_status_idx
    ON operations.approvals (organization_id, status);
CREATE INDEX IF NOT EXISTS approvals_due_status_idx
    ON operations.approvals (due_at, status);

CREATE TABLE IF NOT EXISTS operations.leads (
    id TEXT PRIMARY KEY,
    organization_id TEXT
        REFERENCES operations.organizations(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    channel TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'NEW'
        CHECK (stage IN ('NEW', 'QUALIFIED', 'DIAGNOSIS', 'PROPOSAL', 'WON', 'LOST')),
    estimated_value NUMERIC(14, 2),
    next_action_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_stage_next_action_idx
    ON operations.leads (stage, next_action_at);
CREATE INDEX IF NOT EXISTS leads_organization_stage_idx
    ON operations.leads (organization_id, stage);

CREATE TABLE IF NOT EXISTS operations.domains (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL
        REFERENCES operations.organizations(id) ON DELETE CASCADE,
    brand_id TEXT
        REFERENCES operations.brands(id) ON DELETE SET NULL,
    fqdn TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('PENDING', 'ACTIVE', 'RENEWAL_DUE', 'EXPIRED', 'TRANSFERRED_OUT')),
    registrar TEXT,
    expires_at TIMESTAMPTZ,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    next_action_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS domains_organization_status_idx
    ON operations.domains (organization_id, status);
CREATE INDEX IF NOT EXISTS domains_expires_status_idx
    ON operations.domains (expires_at, status);

CREATE TABLE IF NOT EXISTS operations.audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_id TEXT,
    organization_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operations_audit_created_idx
    ON operations.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS operations_audit_actor_created_idx
    ON operations.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operations_audit_organization_created_idx
    ON operations.audit_events (organization_id, created_at DESC);
