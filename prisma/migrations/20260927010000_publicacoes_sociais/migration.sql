CREATE TABLE operations.social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES operations.organizations(id),
  nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,nome)
);
CREATE TABLE operations.social_destinations (
  perfil_id uuid NOT NULL REFERENCES operations.social_profiles(id),
  canal text NOT NULL CHECK(canal IN ('instagram','facebook','reddit','tiktok','whatsapp')),
  identificador text NOT NULL,
  credencial text NOT NULL CHECK(credencial ~ '^(SOCIAL_[A-Z0-9_]+_TOKEN|META_EMPRESA)$'),
  ativo boolean NOT NULL DEFAULT false,
  PRIMARY KEY(perfil_id,canal)
);
CREATE TABLE operations.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave uuid NOT NULL UNIQUE,
  perfil_id uuid NOT NULL REFERENCES operations.social_profiles(id),
  conteudo jsonb NOT NULL,
  agendado_em timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'RASCUNHO' CHECK(estado IN ('RASCUNHO','AGENDADO','PROCESSANDO','PUBLICADO','CANCELADO')),
  versao integer NOT NULL DEFAULT 1,
  criado_por text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  publicado_em timestamptz
);
CREATE TABLE operations.social_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES operations.social_posts(id),
  canal text NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  destino jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'PENDENTE' CHECK(estado IN ('PENDENTE','PROCESSANDO','REPETIR','RECONCILIAR','QUARENTENA','PUBLICADO','CANCELADO')),
  tentativa integer NOT NULL DEFAULT 0,
  proxima_em timestamptz NOT NULL DEFAULT now(),
  reserva uuid,
  reserva_ate timestamptz,
  checkpoint jsonb NOT NULL DEFAULT '{}',
  id_externo text,
  url_publicada text,
  ultimo_erro text,
  publicado_em timestamptz,
  UNIQUE(post_id,canal),
  CHECK(estado <> 'PUBLICADO' OR (id_externo IS NOT NULL AND publicado_em IS NOT NULL))
);
CREATE INDEX social_deliveries_fila ON operations.social_deliveries(proxima_em) WHERE estado IN ('PENDENTE','REPETIR');
CREATE TABLE operations.social_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES operations.social_posts(id),
  entrega_id uuid REFERENCES operations.social_deliveries(id),
  evento text NOT NULL,
  autor text NOT NULL,
  detalhe jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);
