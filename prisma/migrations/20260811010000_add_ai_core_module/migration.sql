CREATE SCHEMA IF NOT EXISTS ai_core;

CREATE TABLE IF NOT EXISTS ai_core.ai_core_telemetry (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    agent_id TEXT NOT NULL,
    actor_id TEXT,
    request_id TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    estimated_cost_usd NUMERIC(12, 6) NOT NULL,
    latency_ms INTEGER NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'ERROR', 'BLOCKED')),
    error_message TEXT,
    tools_invoked JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_core_telemetry_org_project_created_idx
    ON ai_core.ai_core_telemetry (organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_core_telemetry_org_env_created_idx
    ON ai_core.ai_core_telemetry (organization_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_core_telemetry_outcome_created_idx
    ON ai_core.ai_core_telemetry (outcome, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_core.ai_core_approvals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    agent_id TEXT NOT NULL,
    actor_id TEXT,
    tool_name TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED')),
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_core_approvals_project_tool_idempotency_key
        UNIQUE (project_id, tool_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_core_approvals_org_status_created_idx
    ON ai_core.ai_core_approvals (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_core_approvals_expires_status_idx
    ON ai_core.ai_core_approvals (expires_at, status);

CREATE TABLE IF NOT EXISTS ai_core.ai_core_spend_policies (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    limit_usd NUMERIC(12, 2) NOT NULL,
    spent_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_core_spend_policies_org_project_env_period_key
        UNIQUE (organization_id, project_id, environment, period_start)
);

CREATE INDEX IF NOT EXISTS ai_core_spend_policies_org_env_idx
    ON ai_core.ai_core_spend_policies (organization_id, environment);

CREATE TABLE IF NOT EXISTS ai_core.ai_core_eval_runs (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    project_id TEXT NOT NULL,
    suite_name TEXT NOT NULL,
    prompt_version TEXT,
    model TEXT NOT NULL,
    total INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    failed INTEGER NOT NULL,
    critical_failures INTEGER NOT NULL,
    should_block_deploy BOOLEAN NOT NULL,
    results_json JSONB NOT NULL,
    run_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_core_eval_runs_project_created_idx
    ON ai_core.ai_core_eval_runs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_core_eval_runs_suite_created_idx
    ON ai_core.ai_core_eval_runs (suite_name, created_at DESC);

-- Organização interna reservada para uso do próprio Ávila AI Core (rota de
-- validação administrativa e, futuramente, o piloto do assistente comercial
-- da própria Ávila Ops).
INSERT INTO operations.organizations (id, name, slug, status)
VALUES ('avila-ops-internal', 'Ávila Ops (interno)', 'avila-ops-internal', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
