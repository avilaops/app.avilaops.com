ALTER TABLE operations.domains
    ADD COLUMN IF NOT EXISTS cloudflare_zone_id TEXT,
    ADD COLUMN IF NOT EXISTS cloudflare_plan TEXT,
    ADD COLUMN IF NOT EXISTS cloudflare_status TEXT,
    ADD COLUMN IF NOT EXISTS dns_last_synced_at TIMESTAMPTZ;

-- Constraint única "de verdade" (não índice parcial): Postgres já permite
-- múltiplos NULLs numa coluna UNIQUE normal, e o Prisma `upsert` (ON CONFLICT)
-- só reconhece constraints/índices únicos completos, não índices parciais.
ALTER TABLE operations.domains
    ADD CONSTRAINT domains_cloudflare_zone_id_key UNIQUE (cloudflare_zone_id);

ALTER TABLE operations.integration_connections
    ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE operations.leads
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS operations.dns_records (
    id TEXT PRIMARY KEY,
    domain_asset_id TEXT NOT NULL
        REFERENCES operations.domains(id) ON DELETE CASCADE,
    cloudflare_record_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    proxied BOOLEAN NOT NULL DEFAULT FALSE,
    ttl INTEGER NOT NULL DEFAULT 1,
    priority INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dns_records_domain_asset_idx
    ON operations.dns_records (domain_asset_id);
CREATE INDEX IF NOT EXISTS dns_records_type_name_idx
    ON operations.dns_records (type, name);
