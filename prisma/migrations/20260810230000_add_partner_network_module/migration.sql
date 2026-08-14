CREATE SCHEMA IF NOT EXISTS partnerships;

CREATE TABLE IF NOT EXISTS partnerships.partner_pillars (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    weight INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partnerships.partner_roadmap_items (
    id TEXT PRIMARY KEY,
    phase TEXT NOT NULL CHECK (phase IN ('FOUNDATION', 'IMPLEMENTATION', 'EVIDENCE')),
    label TEXT NOT NULL,
    owner TEXT,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_roadmap_items_phase_sort_idx
    ON partnerships.partner_roadmap_items (phase, sort_order);

CREATE TABLE IF NOT EXISTS partnerships.partner_cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    competency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (status IN ('NOT_STARTED', 'PILOT', 'PRODUCTION', 'DOCUMENTED')),
    summary TEXT,
    metrics JSONB NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partnerships.partner_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE')),
    link_url TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_documents_category_sort_idx
    ON partnerships.partner_documents (category, sort_order);

INSERT INTO partnerships.partner_pillars (id, label, weight, description) VALUES
    ('technical', 'Competência técnica', 25, 'API, agentes, Codex e ChatGPT para empresas.'),
    ('clients', 'Projetos e resultados', 25, 'Casos reais implantados, mesmo em pequena escala.'),
    ('governance', 'Segurança e governança', 20, 'Dados, acessos, custos e riscos sob controle.'),
    ('commercial', 'Processo comercial', 15, 'Oferta, diagnóstico, proposta, contrato e pipeline.'),
    ('delivery', 'Implantação e suporte', 15, 'Descoberta, desenvolvimento, testes, produção e suporte.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO partnerships.partner_roadmap_items (id, phase, label, owner, done, sort_order, completed_at) VALUES
    ('f1', 'FOUNDATION', 'Nomear responsável pela prática OpenAI', 'Nícolas Ávila', TRUE, 1, NOW()),
    ('f2', 'FOUNDATION', 'Cadastro inicial na Partner Network', NULL, TRUE, 2, NOW()),
    ('f3', 'FOUNDATION', 'Mapear competências da equipe', NULL, TRUE, 3, NOW()),
    ('f4', 'FOUNDATION', 'Definir trilha técnica', NULL, FALSE, 4, NULL),
    ('f5', 'FOUNDATION', 'Criar o Ávila AI Core', NULL, FALSE, 5, NULL),
    ('f6', 'FOUNDATION', 'Escrever políticas de segurança', NULL, FALSE, 6, NULL),
    ('f7', 'FOUNDATION', 'Padronizar diagnóstico e proposta', NULL, FALSE, 7, NULL),
    ('f8', 'FOUNDATION', 'Selecionar três projetos-piloto', NULL, FALSE, 8, NULL),
    ('i1', 'IMPLEMENTATION', 'Construir os pilotos', NULL, FALSE, 1, NULL),
    ('i2', 'IMPLEMENTATION', 'Criar conjunto de avaliações', NULL, FALSE, 2, NULL),
    ('i3', 'IMPLEMENTATION', 'Implementar logs e custos por projeto', NULL, FALSE, 3, NULL),
    ('i4', 'IMPLEMENTATION', 'Realizar testes de segurança', NULL, FALSE, 4, NULL),
    ('i5', 'IMPLEMENTATION', 'Treinar atendimento e suporte', NULL, FALSE, 5, NULL),
    ('i6', 'IMPLEMENTATION', 'Registrar arquitetura e decisões', NULL, FALSE, 6, NULL),
    ('i7', 'IMPLEMENTATION', 'Começar a medir os indicadores', NULL, FALSE, 7, NULL),
    ('e1', 'EVIDENCE', 'Colocar pelo menos dois casos em produção', NULL, FALSE, 1, NULL),
    ('e2', 'EVIDENCE', 'Coletar depoimentos e autorização dos clientes', NULL, FALSE, 2, NULL),
    ('e3', 'EVIDENCE', 'Preparar estudos de caso', NULL, FALSE, 3, NULL),
    ('e4', 'EVIDENCE', 'Consolidar métricas', NULL, FALSE, 4, NULL),
    ('e5', 'EVIDENCE', 'Documentar suporte e incidentes', NULL, FALSE, 5, NULL),
    ('e6', 'EVIDENCE', 'Organizar pipeline comercial', NULL, FALSE, 6, NULL),
    ('e7', 'EVIDENCE', 'Revisar o dossiê', NULL, FALSE, 7, NULL),
    ('e8', 'EVIDENCE', 'Enviar ou atualizar a candidatura', NULL, FALSE, 8, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO partnerships.partner_cases (id, title, competency, sort_order, summary) VALUES
    ('comercial', 'Assistente comercial Ávila Ops', 'Comercial · Agente', 1,
        'Qualifica leads, recomenda serviços, registra no CRM e encaminha para atendimento humano.'),
    ('mello', 'Copiloto operacional — Mello Transportes', 'Operação · Copiloto', 2,
        'Consulta coletas e entregas, resume ocorrências, classifica comprovantes, sem autonomia irrestrita.'),
    ('codex', 'Engenharia assistida por Codex', 'Técnica · Processo', 3,
        'Auditoria, planejamento, implementação, testes e revisão com aprovação humana antes de produção.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO partnerships.partner_documents (id, title, category, scope, sort_order) VALUES
    ('doc-security', 'Política de Segurança e Uso Responsável de IA', 'POLICY', 'COMPANY', 1),
    ('doc-continuity', 'Plano de Continuidade e Retaguarda', 'POLICY', 'COMPANY', 2),
    ('doc-ops-comercial', 'Documentação Operacional — Assistente comercial', 'OPERATIONS', 'PROJECT', 3),
    ('doc-ops-mello', 'Documentação Operacional — Mello Transportes', 'OPERATIONS', 'PROJECT', 4),
    ('doc-ops-codex', 'Documentação Operacional — Engenharia com Codex', 'OPERATIONS', 'PROJECT', 5),
    ('doc-risk-comercial', 'Matriz de Riscos — Assistente comercial', 'RISK', 'PROJECT', 6),
    ('doc-risk-mello', 'Matriz de Riscos — Mello Transportes', 'RISK', 'PROJECT', 7),
    ('doc-risk-codex', 'Matriz de Riscos — Engenharia com Codex', 'RISK', 'PROJECT', 8),
    ('doc-case-comercial', 'Estudo de Caso — Assistente comercial', 'CASE_STUDY', 'PROJECT', 9),
    ('doc-case-mello', 'Estudo de Caso — Mello Transportes', 'CASE_STUDY', 'PROJECT', 10),
    ('doc-case-codex', 'Estudo de Caso — Engenharia com Codex', 'CASE_STUDY', 'PROJECT', 11)
ON CONFLICT (id) DO NOTHING;
