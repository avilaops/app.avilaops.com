CREATE TABLE IF NOT EXISTS operations.deliverables (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL
        REFERENCES operations.organizations(id) ON DELETE CASCADE,
    project_id TEXT
        REFERENCES operations.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'PAID', 'CANCELLED')),
    access_token TEXT NOT NULL UNIQUE,
    preview_file_name TEXT,
    preview_mime_type TEXT,
    full_file_name TEXT,
    full_mime_type TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deliverables_organization_status_idx
    ON operations.deliverables (organization_id, status);
CREATE INDEX IF NOT EXISTS deliverables_project_idx
    ON operations.deliverables (project_id);

CREATE TABLE IF NOT EXISTS operations.deliverable_charges (
    id TEXT PRIMARY KEY,
    deliverable_id TEXT NOT NULL
        REFERENCES operations.deliverables(id) ON DELETE CASCADE,
    method TEXT NOT NULL
        CHECK (method IN ('PIX', 'BOLETO', 'CARD')),
    provider TEXT NOT NULL DEFAULT 'EFI',
    external_id TEXT,
    status TEXT NOT NULL DEFAULT 'CREATED'
        CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED')),
    amount NUMERIC(10, 2) NOT NULL,
    pix_copy_paste TEXT,
    pix_qr_base64 TEXT,
    boleto_url TEXT,
    boleto_barcode TEXT,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deliverable_charges_deliverable_status_idx
    ON operations.deliverable_charges (deliverable_id, status);
CREATE INDEX IF NOT EXISTS deliverable_charges_external_idx
    ON operations.deliverable_charges (external_id);
