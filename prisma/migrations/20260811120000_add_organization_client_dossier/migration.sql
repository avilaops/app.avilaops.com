CREATE TABLE IF NOT EXISTS operations.organization_profiles (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL UNIQUE REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    owner_name TEXT,
    owner_role TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    best_contact_time TEXT,
    state_registration TEXT,
    municipal_registration TEXT,
    company_description TEXT,
    services_offered TEXT,
    products_offered TEXT,
    commercial_differentials TEXT,
    service_area TEXT,
    postal_code TEXT,
    street TEXT,
    number TEXT,
    complement TEXT,
    district TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'Brasil',
    internal_owner_name TEXT,
    next_action TEXT,
    onboarding_stage TEXT NOT NULL DEFAULT 'BASIC',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operations.organization_web_presence (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL UNIQUE REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    has_current_site BOOLEAN,
    current_site_url TEXT,
    has_domain BOOLEAN,
    primary_domain TEXT,
    site_provider TEXT,
    access_status TEXT,
    site_notes TEXT,
    wants_custom_domain BOOLEAN,
    selected_domain_plan_slug TEXT,
    desired_domain TEXT,
    preferred_extension TEXT,
    alternative_domains TEXT,
    domain_availability_status TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    domain_registered_at TIMESTAMP(3),
    domain_expires_at TIMESTAMP(3),
    auto_renewal BOOLEAN,
    renewal_owner TEXT,
    current_provider TEXT,
    facebook_page_name TEXT,
    facebook_url TEXT,
    instagram_handle TEXT,
    instagram_url TEXT,
    linkedin_url TEXT,
    tiktok_url TEXT,
    youtube_url TEXT,
    google_business_profile_url TEXT,
    other_social_profiles TEXT,
    has_pdf_catalog TEXT,
    social_media_owner_status TEXT,
    has_professional_email TEXT,
    has_complete_brand_identity TEXT,
    online_store_interest BOOLEAN NOT NULL DEFAULT FALSE,
    online_store_notes TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operations.organization_seo_keywords (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    keyword TEXT NOT NULL,
    intent TEXT,
    locality TEXT,
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    estimated_volume TEXT,
    recommended_page TEXT,
    status TEXT NOT NULL DEFAULT 'RECOMMENDED',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS organization_seo_keywords_organization_priority_idx
    ON operations.organization_seo_keywords(organization_id, priority);

CREATE TABLE IF NOT EXISTS operations.organization_brand_assets (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    asset_type TEXT NOT NULL,
    name TEXT,
    url TEXT,
    format TEXT,
    dimensions TEXT,
    size_bytes INTEGER,
    version TEXT DEFAULT '1',
    notes TEXT,
    uploaded_by TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS organization_brand_assets_organization_asset_type_idx
    ON operations.organization_brand_assets(organization_id, asset_type);

CREATE TABLE IF NOT EXISTS operations.organization_integrations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    provider TEXT NOT NULL,
    public_id TEXT,
    account_name TEXT,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_integrations_organization_provider_key
    ON operations.organization_integrations(organization_id, provider);
CREATE INDEX IF NOT EXISTS organization_integrations_provider_status_idx
    ON operations.organization_integrations(provider, status);

CREATE TABLE IF NOT EXISTS operations.service_plans (
    id TEXT PRIMARY KEY,
    service_type TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'BRL',
    billing_cycle TEXT,
    limits JSONB,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS service_plans_service_type_status_sort_order_idx
    ON operations.service_plans(service_type, status, sort_order);

CREATE TABLE IF NOT EXISTS operations.organization_service_opportunities (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES operations.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    service_type TEXT NOT NULL,
    current_situation TEXT,
    interest_status TEXT,
    plan_id TEXT REFERENCES operations.service_plans(id) ON DELETE SET NULL ON UPDATE CASCADE,
    commercial_status TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
    notes TEXT,
    next_action TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_service_opportunities_organization_service_type_key
    ON operations.organization_service_opportunities(organization_id, service_type);
CREATE INDEX IF NOT EXISTS organization_service_opportunities_commercial_status_idx
    ON operations.organization_service_opportunities(commercial_status);

INSERT INTO operations.service_plans (id, service_type, slug, name, description, price_cents, billing_cycle, limits, sort_order)
VALUES
    ('domain-1-year', 'DOMAIN', 'domain-1-year', 'Domínio personalizado · 1 ano', 'Registro ou gestão de domínio personalizado por 1 ano, sujeito à confirmação de disponibilidade e preço real.', 6000, 'YEARLY', '{"years":1}'::jsonb, 10),
    ('domain-2-years', 'DOMAIN', 'domain-2-years', 'Domínio personalizado · 2 anos', 'Registro ou gestão de domínio personalizado por 2 anos, sujeito à confirmação de disponibilidade e preço real.', 12000, 'TWO_YEARS', '{"years":2}'::jsonb, 20),
    ('domain-4-years', 'DOMAIN', 'domain-4-years', 'Domínio personalizado · 4 anos', 'Registro ou gestão de domínio personalizado por 4 anos, sujeito à confirmação de disponibilidade e preço real.', 22000, 'FOUR_YEARS', '{"years":4}'::jsonb, 30),
    ('domain-none', 'DOMAIN', 'domain-none', 'Não irá utilizar domínio no momento', 'Cliente optou por não usar domínio personalizado nesta etapa.', 0, 'NONE', '{"contractable":false}'::jsonb, 40),
    ('catalog-essential', 'PDF_CATALOG', 'catalog-essential', 'Catálogo Essencial', 'Estrutura objetiva para apresentar produtos ou serviços em PDF.', NULL, NULL, '{"tier":"essential"}'::jsonb, 10),
    ('catalog-professional', 'PDF_CATALOG', 'catalog-professional', 'Catálogo Profissional', 'Catálogo com organização comercial, descrição, identidade visual e melhor acabamento.', NULL, NULL, '{"tier":"professional"}'::jsonb, 20),
    ('catalog-premium', 'PDF_CATALOG', 'catalog-premium', 'Catálogo Premium', 'Catálogo avançado com narrativa comercial, variações visuais e suporte a campanhas.', NULL, NULL, '{"tier":"premium"}'::jsonb, 30),
    ('social-essential', 'SOCIAL_MEDIA', 'social-essential', 'Redes Sociais Essencial', 'Presença mínima organizada para manter canais ativos e coerentes.', NULL, 'MONTHLY', '{"tier":"essential"}'::jsonb, 10),
    ('social-growth', 'SOCIAL_MEDIA', 'social-growth', 'Redes Sociais Crescimento', 'Conteúdo e rotina com foco em geração de demanda e consistência comercial.', NULL, 'MONTHLY', '{"tier":"growth"}'::jsonb, 20),
    ('social-complete-presence', 'SOCIAL_MEDIA', 'social-complete-presence', 'Presença Completa', 'Gestão mais ampla de conteúdo, campanhas, calendário e acompanhamento.', NULL, 'MONTHLY', '{"tier":"complete"}'::jsonb, 30),
    ('brand-essential', 'BRAND_IDENTITY', 'brand-essential', 'Identidade Visual Essencial', 'Padronização inicial de marca para canais digitais e materiais básicos.', NULL, NULL, '{"tier":"essential"}'::jsonb, 10),
    ('brand-professional', 'BRAND_IDENTITY', 'brand-professional', 'Identidade Visual Profissional', 'Identidade com sistema visual, variações, aplicações e materiais comerciais.', NULL, NULL, '{"tier":"professional"}'::jsonb, 20),
    ('brand-premium', 'BRAND_IDENTITY', 'brand-premium', 'Identidade Visual Premium', 'Sistema de marca completo com manual, templates e direção visual avançada.', NULL, NULL, '{"tier":"premium"}'::jsonb, 30)
ON CONFLICT (slug) DO UPDATE SET
    service_type = EXCLUDED.service_type,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    billing_cycle = EXCLUDED.billing_cycle,
    limits = EXCLUDED.limits,
    sort_order = EXCLUDED.sort_order,
    updated_at = CURRENT_TIMESTAMP;
