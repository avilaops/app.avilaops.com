-- O gateway padrão da cobrança de entregável deixa de ser o Efí.
--
-- O Efí não emite cobrança nova desde 31/08/2026; quem cobra é o Mercado Pago.
-- As duas criações de `deliverable_charges` já gravam `MERCADO_PAGO` explícito
-- desde 01/10 (P1-6 de docs/mercadopago-auditoria-e-roadmap.md), mas o padrão
-- da coluna seguia `EFI`: uma criação nova que esquecesse o campo nasceria no
-- gateway errado, e o webhook do Efí, que só reconsulta o que é `EFI`, mandaria
-- o id do Mercado Pago para a API do Efí.
--
-- Aditivo: só troca o padrão da coluna. Nenhuma linha é alterada — em produção,
-- em 10/10/2026, a tabela está vazia, então não há linha antiga a corrigir.

ALTER TABLE "operations"."deliverable_charges"
    ALTER COLUMN "provider" SET DEFAULT 'MERCADO_PAGO';
