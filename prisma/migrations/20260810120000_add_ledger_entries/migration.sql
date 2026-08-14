CREATE TABLE IF NOT EXISTS finance.ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    direction TEXT NOT NULL CHECK (direction IN ('PAYABLE', 'RECEIVABLE')),
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'PAID', 'OVERDUE', 'CANCELED')),
    description TEXT NOT NULL,
    counterparty TEXT,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    due_date TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    category TEXT,
    reference_type TEXT,
    reference_id TEXT,
    note TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ledger_entries_direction_status_due_idx
    ON finance.ledger_entries (direction, status, due_date);
CREATE INDEX IF NOT EXISTS ledger_entries_due_idx
    ON finance.ledger_entries (due_date);
