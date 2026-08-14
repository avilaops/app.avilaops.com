ALTER TABLE operations.domains
    ADD COLUMN IF NOT EXISTS index_now_key TEXT;
