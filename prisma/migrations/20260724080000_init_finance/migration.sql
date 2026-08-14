CREATE SCHEMA IF NOT EXISTS finance;

CREATE TABLE IF NOT EXISTS finance.bank_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    environment TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bank_accounts_provider_external_environment_key
        UNIQUE (provider, external_id, environment)
);

CREATE TABLE IF NOT EXISTS finance.balance_snapshots (
    id BIGSERIAL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES finance.bank_accounts(id) ON DELETE CASCADE,
    available_balance NUMERIC(14, 2) NOT NULL,
    blocked_total NUMERIC(14, 2),
    blocked_judicial NUMERIC(14, 2),
    blocked_med NUMERIC(14, 2),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS balance_snapshots_account_captured_idx
    ON finance.balance_snapshots (account_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS finance.bank_transactions (
    id BIGSERIAL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES finance.bank_accounts(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    end_to_end_id TEXT,
    txid TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    transaction_type TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'BRL',
    description TEXT NOT NULL,
    counterparty_name TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    raw_hash TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bank_transactions_account_external_key UNIQUE (account_id, external_id)
);

CREATE INDEX IF NOT EXISTS bank_transactions_account_occurred_idx
    ON finance.bank_transactions (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_direction_occurred_idx
    ON finance.bank_transactions (direction, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_txid_idx
    ON finance.bank_transactions (txid);

CREATE TABLE IF NOT EXISTS finance.reconciliations (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL UNIQUE
        REFERENCES finance.bank_transactions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'REVIEW', 'MATCHED', 'IGNORED')),
    reference_type TEXT,
    reference_id TEXT,
    note TEXT,
    confidence NUMERIC(5, 4),
    match_source TEXT,
    reviewed_by TEXT,
    matched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reconciliations_status_updated_idx
    ON finance.reconciliations (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS finance.bank_sync_runs (
    id BIGSERIAL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES finance.bank_accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    scope_days INTEGER NOT NULL CHECK (scope_days BETWEEN 1 AND 365),
    received_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    balance_captured BOOLEAN NOT NULL DEFAULT FALSE,
    error_code TEXT,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bank_sync_runs_account_started_idx
    ON finance.bank_sync_runs (account_id, started_at DESC);

CREATE TABLE IF NOT EXISTS finance.audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx
    ON finance.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
    ON finance.audit_events (actor_id, created_at DESC);

INSERT INTO finance.bank_accounts (
    id,
    provider,
    external_id,
    display_name,
    environment,
    currency
) VALUES (
    'efi-production',
    'efi',
    'primary',
    'Conta Efí Produção',
    'production',
    'BRL'
)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    active = TRUE,
    updated_at = NOW();
