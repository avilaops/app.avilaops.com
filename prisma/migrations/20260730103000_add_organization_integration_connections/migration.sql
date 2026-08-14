CREATE TABLE IF NOT EXISTS operations.organization_integration_connections (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  provider text NOT NULL,
  external_id text,
  account_name text,
  status text NOT NULL DEFAULT 'ACTIVE',
  scopes jsonb,
  token_type text,
  token_expires_at timestamptz,
  token_ciphertext text,
  metadata jsonb,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_integration_connections_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT organization_integration_connections_organization_id_provider_key
    UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS organization_integration_connections_provider_status_idx
  ON operations.organization_integration_connections(provider, status);

CREATE INDEX IF NOT EXISTS organization_integration_connections_organization_id_status_idx
  ON operations.organization_integration_connections(organization_id, status);
