-- Camada de políticas e parâmetros (POLITICAS-E-PARAMETROS.md do
-- cliente.avilaops.com; REQUISITOS NF13: "deve existir antes do primeiro fluxo
-- de domínio").
--
-- Todo prazo, limite ou lista que decide algo sobre domínio passa a ter dono,
-- fonte e data de vigência, em vez de um número solto no código. Cada linha é
-- uma versão; mudança é linha nova, e o evento usa a versão em vigor na data
-- dele. Por isso o app_avila recebe SELECT e INSERT, sem UPDATE nem DELETE.
--
-- Aditivo: só cria tabela nova e as sementes. As regras externas entram
-- vigentes com a fonte da minuta; as políticas do produto entram PENDENTES,
-- porque na minuta são "valor proposto" e pendente não decide nada até o dono
-- do serviço confirmar pela tela de parâmetros.

CREATE TABLE IF NOT EXISTS "operations"."policy_parameter_versions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "value" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "sources" TEXT[],
    "effective_from" DATE NOT NULL,
    "review_at" DATE,
    "owner" TEXT NOT NULL,
    "note" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_parameter_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_parameter_versions_layer_check"
      CHECK ("layer" IN ('REGRA_EXTERNA', 'REGRA_FORNECEDOR', 'POLITICA_PRODUTO')),
    CONSTRAINT "policy_parameter_versions_state_check"
      CHECK ("state" IN ('VIGENTE', 'PENDENTE_DE_CONFIRMACAO', 'MONITORADA'))
);

CREATE INDEX IF NOT EXISTS "policy_parameter_versions_key_scope_effective_from_idx"
    ON "operations"."policy_parameter_versions" ("key", "scope", "effective_from");

INSERT INTO "operations"."policy_parameter_versions"
    ("id", "key", "layer", "scope", "value", "state", "sources", "effective_from", "review_at", "owner", "note")
VALUES
    ('semente:icann.errp.aviso1JanelaDias', 'icann.errp.aviso1JanelaDias', 'REGRA_EXTERNA', 'global', '{"min": 26, "max": 35}'::JSONB, 'VIGENTE', ARRAY['F1']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:icann.errp.aviso2JanelaDias', 'icann.errp.aviso2JanelaDias', 'REGRA_EXTERNA', 'global', '{"min": 4, "max": 10}'::JSONB, 'VIGENTE', ARRAY['F1']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:icann.errp.avisoPosVencimentoMaxDias', 'icann.errp.avisoPosVencimentoMaxDias', 'REGRA_EXTERNA', 'global', '5'::JSONB, 'VIGENTE', ARRAY['F1']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:icann.errp.interrupcaoDnsMinDias', 'icann.errp.interrupcaoDnsMinDias', 'REGRA_EXTERNA', 'global', '8'::JSONB, 'VIGENTE', ARRAY['F1']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:icann.errp.resgateDias', 'icann.errp.resgateDias', 'REGRA_EXTERNA', 'global', '30'::JSONB, 'VIGENTE', ARRAY['F1']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:icann.transfer.travaAposCriacaoDias', 'icann.transfer.travaAposCriacaoDias', 'REGRA_EXTERNA', 'global', '60'::JSONB, 'VIGENTE', ARRAY['F2','F3','F20']::TEXT[], DATE '2025-08-21', DATE '2026-12-16', 'Dono do serviço', 'Transfer Policy de 21/02/2024, cumprimento obrigatório desde 21/08/2025 (F2). Revisão monitorada (F20).'),
    ('semente:icann.transfer.travaAposTransferenciaDias', 'icann.transfer.travaAposTransferenciaDias', 'REGRA_EXTERNA', 'global', '60'::JSONB, 'VIGENTE', ARRAY['F2','F3','F20']::TEXT[], DATE '2025-08-21', DATE '2026-12-16', 'Dono do serviço', 'Transfer Policy de 21/02/2024, cumprimento obrigatório desde 21/08/2025 (F2). Revisão monitorada (F20).'),
    ('semente:icann.transfer.travaAposTrocaTitularDias', 'icann.transfer.travaAposTrocaTitularDias', 'REGRA_EXTERNA', 'global', '60'::JSONB, 'VIGENTE', ARRAY['F2','F3','F20']::TEXT[], DATE '2025-08-21', DATE '2026-12-16', 'Dono do serviço', 'Transfer Policy de 21/02/2024, cumprimento obrigatório desde 21/08/2025 (F2). Revisão monitorada (F20).'),
    ('semente:icann.transfer.codigoAutorizacaoMaxDias', 'icann.transfer.codigoAutorizacaoMaxDias', 'REGRA_EXTERNA', 'global', '5'::JSONB, 'VIGENTE', ARRAY['F2']::TEXT[], DATE '2025-08-21', NULL, 'Dono do serviço', 'Transfer Policy, cumprimento obrigatório desde 21/08/2025 (F2).'),
    ('semente:icann.verificacaoContato.prazoDias', 'icann.verificacaoContato.prazoDias', 'REGRA_EXTERNA', 'global', '15'::JSONB, 'VIGENTE', ARRAY['F4','F5']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:nicbr.expiracao.reservaTitularDias', 'nicbr.expiracao.reservaTitularDias', 'REGRA_EXTERNA', 'global', '90'::JSONB, 'VIGENTE', ARRAY['F10']::TEXT[], DATE '2026-09-16', NULL, 'Dono do serviço', 'Até 90 dias. Vigência conferida na consulta da fonte em 16/09/2026; o início real é anterior e não está registrado. Evento antes dessa data não tem regra aqui e vai para operação humana.'),
    ('semente:produto.renovacao.automaticaPadrao', 'produto.renovacao.automaticaPadrao', 'POLITICA_PRODUTO', 'global', 'true'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 02 §5.1']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.renovacao.tentativasDiasAntes', 'produto.renovacao.tentativasDiasAntes', 'POLITICA_PRODUTO', 'global', '[30, 15, 7, 3, 1]'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 06 §2']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.renovacao.janelaMonitoramentoDias', 'produto.renovacao.janelaMonitoramentoDias', 'POLITICA_PRODUTO', 'global', '60'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['interno 02']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.avisos.diasAntes', 'produto.avisos.diasAntes', 'POLITICA_PRODUTO', 'global', '[30, 7, 1]'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 02 §5.2']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.avisos.diasDepois', 'produto.avisos.diasDepois', 'POLITICA_PRODUTO', 'global', '[1, 5]'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 02 §5.2']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.transferencia.travaPadraoLigada', 'produto.transferencia.travaPadraoLigada', 'POLITICA_PRODUTO', 'global', 'true'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['ajuda trava-de-transferencia']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.transferencia.reterPorDebito', 'produto.transferencia.reterPorDebito', 'POLITICA_PRODUTO', 'global', 'false'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 02 §6.2']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.transferencia.zonaAposSaidaDias', 'produto.transferencia.zonaAposSaidaDias', 'POLITICA_PRODUTO', 'global', '30'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 02 §6.2','externo 04 §4']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.recuperacaoConta.esperaHoras', 'produto.recuperacaoConta.esperaHoras', 'POLITICA_PRODUTO', 'global', '72'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['interno 11']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.recuperacaoConta.travaTransferenciaDias', 'produto.recuperacaoConta.travaTransferenciaDias', 'POLITICA_PRODUTO', 'global', '7'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['interno 11']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.inadimplencia.bloqueioNovasComprasDias', 'produto.inadimplencia.bloqueioNovasComprasDias', 'POLITICA_PRODUTO', 'global', '15'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 06 §7']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.precos.avisoReajusteDias', 'produto.precos.avisoReajusteDias', 'POLITICA_PRODUTO', 'global', '30'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['externo 02 §9','externo 06 §3']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.saldoRegistrador.alertaDias', 'produto.saldoRegistrador.alertaDias', 'POLITICA_PRODUTO', 'global', '7'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['interno 07']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.'),
    ('semente:produto.dns.versoesRetencaoDias', 'produto.dns.versoesRetencaoDias', 'POLITICA_PRODUTO', 'global', '90'::JSONB, 'PENDENTE_DE_CONFIRMACAO', ARRAY['interno 13']::TEXT[], DATE '2026-09-17', NULL, 'Dono do serviço', 'Valor proposto na minuta de 17/09/2026; aguarda confirmação do dono do serviço. Pendente não decide nada.')
ON CONFLICT ("id") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA "operations" TO app_avila;
    GRANT SELECT, INSERT ON TABLE "operations"."policy_parameter_versions" TO app_avila;
  END IF;
END $$;
