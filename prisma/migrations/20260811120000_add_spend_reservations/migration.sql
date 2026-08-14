CREATE TABLE IF NOT EXISTS ai_core.ai_core_spend_reservations (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    estimated_cost_usd NUMERIC(12, 6) NOT NULL,
    actual_cost_usd NUMERIC(12, 6),
    status TEXT NOT NULL DEFAULT 'RESERVED'
        CHECK (status IN ('RESERVED', 'CONFIRMED', 'RELEASED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_core_spend_reservations_status_created_idx
    ON ai_core.ai_core_spend_reservations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_core_spend_reservations_policy_idx
    ON ai_core.ai_core_spend_reservations (policy_id);
