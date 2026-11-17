ALTER TABLE operations.billing_email_dispatches
  ADD COLUMN content TEXT NOT NULL DEFAULT 'ambos';

ALTER TABLE operations.billing_email_dispatches
  ADD CONSTRAINT billing_email_dispatches_content_check
  CHECK (content IN ('fatura', 'cobranca', 'ambos'));

CREATE TABLE operations.nfse_dispatches (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL UNIQUE,
  idempotency_key UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claim_token UUID,
  erp_issuance_id TEXT,
  erp_status TEXT,
  access_key TEXT,
  last_error TEXT,
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT nfse_dispatches_invoice_id_fkey FOREIGN KEY (invoice_id)
    REFERENCES operations.subscription_invoices(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT nfse_dispatches_status_check CHECK (
    status IN ('PENDING', 'PROCESSING', 'ISSUED', 'UNCERTAIN', 'FAILED', 'CANCELLED')
  )
);

CREATE INDEX nfse_dispatches_status_next_attempt_at_idx
  ON operations.nfse_dispatches(status, next_attempt_at);
