ALTER TABLE operations.nfse_dispatches
    ADD COLUMN issuance_mode text NOT NULL DEFAULT 'AUTOMATIC'
    CHECK (issuance_mode IN ('AUTOMATIC', 'MANUAL'));
