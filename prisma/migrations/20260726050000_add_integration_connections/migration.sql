CREATE TABLE IF NOT EXISTS operations.integration_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    site_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    last_synced_at TIMESTAMPTZ,
    last_sync_status TEXT,
    last_sync_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT integration_connections_provider_site_url_key UNIQUE (provider, site_url)
);

CREATE INDEX IF NOT EXISTS integration_connections_provider_status_idx
    ON operations.integration_connections (provider, status);
