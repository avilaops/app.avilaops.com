ALTER TABLE operations.organization_brand_assets
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS mime_type TEXT,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS organization_brand_assets_current_idx
    ON operations.organization_brand_assets(organization_id, asset_type, is_current);
