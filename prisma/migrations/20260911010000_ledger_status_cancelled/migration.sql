-- "Cancelar" uma conta a pagar nunca funcionou em produção: a rota grava
-- CANCELLED desde 26/08/2026 e o CHECK criado em 10/08 só aceita CANCELED (um
-- L). Quem clicasse levava 23514, ou seja, erro 500. Mesmo padrão do arquivar
-- domínio (30/08): botão que nunca foi apertado contra o banco real.
--
-- Recriar o CHECK é a correção mínima. CANCELED continua aceito para não
-- invalidar nada que já exista; OVERDUE fica por compatibilidade, embora o app
-- nunca o grave ("vencido" é leitura da data, não estado).
ALTER TABLE finance.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_status_check;

ALTER TABLE finance.ledger_entries
  ADD CONSTRAINT ledger_entries_status_check
  CHECK (status = ANY (ARRAY['OPEN', 'PAID', 'OVERDUE', 'CANCELED', 'CANCELLED']));
