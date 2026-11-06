-- Cadastro aditivo de publicações MCP (uma linha por publicação).
-- Somente metadados. Nenhuma URL é testada, ativada ou publicada por esta migration.
CREATE TABLE IF NOT EXISTS "operations"."mcp_publications" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT,
  "endpoint" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_publications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mcp_publications_endpoint_https_check"
    CHECK ("endpoint" IS NULL OR "endpoint" LIKE 'https://%')
);

INSERT INTO "operations"."mcp_publications" ("id", "name", "domain", "endpoint", "description") VALUES
('auth', 'Auth', 'auth.avilaops.com', 'https://auth.avilaops.com/mcp', 'Identidade e permissões'),
('mail', 'Mail', 'mail.avilaops.com', 'https://mail.avilaops.com/mcp', 'Serviço de e-mail'),
('crm', 'CRM', 'crm.avilaops.com', 'https://crm.avilaops.com/mcp', 'Relacionamento com clientes'),
('tms', 'TMS', 'tms.avilaops.com', 'https://tms.avilaops.com/mcp', 'Transportes e logística'),
('cms', 'CMS', 'cms.avilaops.com', 'https://cms.avilaops.com/mcp', 'Conteúdo e sites'),
('lojas', 'Lojas', 'lojas.avilaops.com', 'https://lojas.avilaops.com/mcp', 'Comércio eletrônico'),
('erp', 'ERP-Next', 'erp.avilaops.com', 'https://erp.avilaops.com/mcp', 'Gestão empresarial'),
('mlops', 'MLOps / Experiments', 'ml.avilaops.com', 'https://ml.avilaops.com/mcp', 'Validação de agentes e modelos'),
('avx-tools', 'Avx-tools', NULL, NULL, 'Ferramentas e processamento técnico'),
('n8n', 'n8n', 'n8n.avilaops.com', NULL, 'Automações e workflows')
ON CONFLICT ("id") DO NOTHING;

-- Seed usa NOW; depois remove o default para corresponder a @updatedAt do Prisma.
ALTER TABLE "operations"."mcp_publications" ALTER COLUMN "updated_at" DROP DEFAULT;

-- O aplicativo consulta este cadastro com a role de runtime da plataforma.
-- Alinhar a propriedade à convenção das demais tabelas do App.
ALTER TABLE "operations"."mcp_publications" OWNER TO app_avila;

