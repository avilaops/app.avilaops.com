CREATE TABLE operations.billing_email_dispatches (
  id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ(6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ(6),
  claimed_at TIMESTAMPTZ(6),
  claim_token TEXT,
  sent_at TIMESTAMPTZ(6),
  cancelled_at TIMESTAMPTZ(6),
  last_error TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT billing_email_dispatches_pkey PRIMARY KEY (id),
  CONSTRAINT billing_email_dispatches_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES operations.subscription_invoices(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX billing_email_dispatches_invoice_id_stage_key
  ON operations.billing_email_dispatches(invoice_id, stage);

CREATE INDEX billing_email_dispatches_status_scheduled_for_idx
  ON operations.billing_email_dispatches(status, scheduled_for);

CREATE INDEX billing_email_dispatches_status_next_attempt_at_idx
  ON operations.billing_email_dispatches(status, next_attempt_at);
