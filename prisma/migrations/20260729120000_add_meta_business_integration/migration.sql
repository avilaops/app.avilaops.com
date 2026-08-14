CREATE TABLE IF NOT EXISTS operations.meta_business_accounts (
  id text PRIMARY KEY,
  organization_id text,
  business_id text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  verification_status text,
  timezone text,
  currency text,
  raw_metadata jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_business_accounts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.meta_pages (
  id text PRIMARY KEY,
  organization_id text,
  business_account_ref_id text,
  page_id text NOT NULL UNIQUE,
  name text NOT NULL,
  username text,
  category text,
  link text,
  status text NOT NULL DEFAULT 'ACTIVE',
  tasks jsonb,
  raw_metadata jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_pages_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_pages_business_account_ref_id_fkey
    FOREIGN KEY (business_account_ref_id) REFERENCES operations.meta_business_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.instagram_accounts (
  id text PRIMARY KEY,
  organization_id text,
  business_account_ref_id text,
  page_ref_id text,
  instagram_account_id text NOT NULL UNIQUE,
  username text NOT NULL,
  name text,
  profile_picture_url text,
  followers_count integer,
  media_count integer,
  status text NOT NULL DEFAULT 'ACTIVE',
  raw_metadata jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_accounts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT instagram_accounts_business_account_ref_id_fkey
    FOREIGN KEY (business_account_ref_id) REFERENCES operations.meta_business_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT instagram_accounts_page_ref_id_fkey
    FOREIGN KEY (page_ref_id) REFERENCES operations.meta_pages(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.meta_ad_accounts (
  id text PRIMARY KEY,
  organization_id text,
  business_account_ref_id text,
  ad_account_id text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text,
  timezone_name text,
  account_status text,
  status text NOT NULL DEFAULT 'ACTIVE',
  raw_metadata jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_accounts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_ad_accounts_business_account_ref_id_fkey
    FOREIGN KEY (business_account_ref_id) REFERENCES operations.meta_business_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.meta_lead_forms (
  id text PRIMARY KEY,
  organization_id text,
  page_ref_id text,
  ad_account_ref_id text,
  form_id text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  questions jsonb,
  raw_metadata jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_lead_forms_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_lead_forms_page_ref_id_fkey
    FOREIGN KEY (page_ref_id) REFERENCES operations.meta_pages(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_lead_forms_ad_account_ref_id_fkey
    FOREIGN KEY (ad_account_ref_id) REFERENCES operations.meta_ad_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.meta_leads (
  id text PRIMARY KEY,
  organization_id text,
  form_ref_id text,
  page_ref_id text,
  ad_account_ref_id text,
  lead_id text UNIQUE,
  leadgen_id text NOT NULL UNIQUE,
  created_time timestamptz,
  field_data jsonb,
  raw_payload jsonb,
  processing_status text NOT NULL DEFAULT 'NEW',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_leads_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_leads_form_ref_id_fkey
    FOREIGN KEY (form_ref_id) REFERENCES operations.meta_lead_forms(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_leads_page_ref_id_fkey
    FOREIGN KEY (page_ref_id) REFERENCES operations.meta_pages(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_leads_ad_account_ref_id_fkey
    FOREIGN KEY (ad_account_ref_id) REFERENCES operations.meta_ad_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_leads_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES operations.leads(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.meta_campaign_snapshots (
  id text PRIMARY KEY,
  organization_id text,
  ad_account_ref_id text,
  campaign_id text NOT NULL,
  campaign_name text,
  status text,
  objective text,
  date_start timestamptz,
  date_stop timestamptz,
  spend numeric(14, 2),
  impressions integer,
  clicks integer,
  leads integer,
  raw_metrics jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_campaign_snapshots_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT meta_campaign_snapshots_ad_account_ref_id_fkey
    FOREIGN KEY (ad_account_ref_id) REFERENCES operations.meta_ad_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS operations.integration_webhook_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text NOT NULL,
  external_id text,
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'RECEIVED',
  payload jsonb NOT NULL,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS meta_business_accounts_organization_id_status_idx
  ON operations.meta_business_accounts(organization_id, status);
CREATE INDEX IF NOT EXISTS meta_pages_organization_id_status_idx
  ON operations.meta_pages(organization_id, status);
CREATE INDEX IF NOT EXISTS meta_pages_business_account_ref_id_idx
  ON operations.meta_pages(business_account_ref_id);
CREATE INDEX IF NOT EXISTS instagram_accounts_organization_id_status_idx
  ON operations.instagram_accounts(organization_id, status);
CREATE INDEX IF NOT EXISTS instagram_accounts_business_account_ref_id_idx
  ON operations.instagram_accounts(business_account_ref_id);
CREATE INDEX IF NOT EXISTS instagram_accounts_page_ref_id_idx
  ON operations.instagram_accounts(page_ref_id);
CREATE INDEX IF NOT EXISTS meta_ad_accounts_organization_id_status_idx
  ON operations.meta_ad_accounts(organization_id, status);
CREATE INDEX IF NOT EXISTS meta_ad_accounts_business_account_ref_id_idx
  ON operations.meta_ad_accounts(business_account_ref_id);
CREATE INDEX IF NOT EXISTS meta_lead_forms_organization_id_status_idx
  ON operations.meta_lead_forms(organization_id, status);
CREATE INDEX IF NOT EXISTS meta_lead_forms_page_ref_id_idx
  ON operations.meta_lead_forms(page_ref_id);
CREATE INDEX IF NOT EXISTS meta_lead_forms_ad_account_ref_id_idx
  ON operations.meta_lead_forms(ad_account_ref_id);
CREATE INDEX IF NOT EXISTS meta_leads_processing_status_created_at_idx
  ON operations.meta_leads(processing_status, created_at);
CREATE INDEX IF NOT EXISTS meta_leads_organization_id_created_at_idx
  ON operations.meta_leads(organization_id, created_at);
CREATE INDEX IF NOT EXISTS meta_leads_form_ref_id_idx
  ON operations.meta_leads(form_ref_id);
CREATE INDEX IF NOT EXISTS meta_leads_page_ref_id_idx
  ON operations.meta_leads(page_ref_id);
CREATE INDEX IF NOT EXISTS meta_leads_ad_account_ref_id_idx
  ON operations.meta_leads(ad_account_ref_id);
CREATE INDEX IF NOT EXISTS meta_campaign_snapshots_organization_id_captured_at_idx
  ON operations.meta_campaign_snapshots(organization_id, captured_at);
CREATE INDEX IF NOT EXISTS meta_campaign_snapshots_ad_account_ref_id_captured_at_idx
  ON operations.meta_campaign_snapshots(ad_account_ref_id, captured_at);
CREATE INDEX IF NOT EXISTS meta_campaign_snapshots_campaign_id_captured_at_idx
  ON operations.meta_campaign_snapshots(campaign_id, captured_at);
CREATE INDEX IF NOT EXISTS integration_webhook_events_provider_status_received_at_idx
  ON operations.integration_webhook_events(provider, status, received_at);
CREATE INDEX IF NOT EXISTS integration_webhook_events_external_id_idx
  ON operations.integration_webhook_events(external_id);
