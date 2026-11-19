-- Fatura CUSTOM no núcleo financeiro.
--
-- `20261117153000_custom_invoice` tornou `subscription_id` opcional e passou
-- `organization_id`/`currency` para a própria fatura, mas a view e os guardas
-- do núcleo (`20260919201000_core_integrity`, `20260919203000_core_queries`)
-- continuaram resolvendo cliente e moeda por INNER JOIN com a assinatura.
-- Resultado: fatura CUSTOM não aparecia em `core.receivables` (a criação da
-- cobrança recusava por "pagamento registrado") e a alocação do pagamento no
-- ledger era rejeitada pelo guarda.
--
-- Recorrente continua igual: cliente e moeda vêm da assinatura quando existe.
-- `FOR UPDATE` não aceita o lado anulável de um LEFT JOIN, então os guardas
-- travam fatura e assinatura em duas leituras, na mesma ordem de antes.

CREATE OR REPLACE VIEW core.receivables AS
WITH allocated AS (
 SELECT a.invoice_id,sum(a.amount) AS amount FROM core.payment_allocations a
 JOIN core.payments p ON p.id=a.payment_id WHERE p.status='CONFIRMED' GROUP BY a.invoice_id
)
SELECT 'INVOICE'::text AS source,i.id AS source_id,coalesce(s.organization_id,i.organization_id) AS organization_id,
 coalesce(s.currency,i.currency) AS currency,
 i.amount,i.due_date,
 CASE WHEN i.status IN ('PAID','CANCELLED') THEN 0::numeric ELSE greatest(i.amount-coalesce(a.amount,0),0) END AS outstanding,
 CASE WHEN i.status IN ('PAID','CANCELLED') THEN i.status
      WHEN coalesce(a.amount,0)>=i.amount THEN 'AWAITING_RECONCILIATION'
      WHEN i.due_date<(statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE 'OPEN' END AS effective_status
FROM operations.subscription_invoices i LEFT JOIN operations.subscriptions s ON s.id=i.subscription_id
LEFT JOIN allocated a ON a.invoice_id=i.id
UNION ALL
SELECT 'LEDGER',l.id::text,NULL::text,l.currency,l.amount,l.due_date,
 CASE WHEN l.status='OPEN' THEN l.amount ELSE 0::numeric END,
 CASE WHEN l.status='OPEN' AND l.due_date<(statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE l.status END
FROM finance.ledger_entries l
WHERE l.direction='RECEIVABLE' AND l.scope='EMPRESA'
AND NOT EXISTS(SELECT 1 FROM core.invoice_ledger_links x WHERE x.ledger_entry_id=l.id);

CREATE OR REPLACE FUNCTION core.guard_allocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p core.payments%ROWTYPE; inv record; sub record; allocated numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.payment_id,NEW.invoice_id) IS DISTINCT FROM (OLD.payment_id,OLD.invoice_id)
 THEN RAISE EXCEPTION 'core: allocation references are immutable' USING ERRCODE='23514'; END IF;
 -- Mesma ordem de locks em todas as alocações; serializa disputas pelo saldo.
 SELECT * INTO p FROM core.payments WHERE id=NEW.payment_id FOR UPDATE;
 SELECT i.amount,i.organization_id,i.currency,i.status,i.subscription_id INTO inv
 FROM operations.subscription_invoices i WHERE i.id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'core: allocation organization/currency/status mismatch' USING ERRCODE='23514'; END IF;
 IF inv.subscription_id IS NOT NULL THEN
  SELECT s.organization_id,s.currency INTO sub FROM operations.subscriptions s WHERE s.id=inv.subscription_id FOR UPDATE;
  inv.organization_id := sub.organization_id;
  inv.currency := sub.currency;
 END IF;
 IF p.id IS NULL OR inv.organization_id IS NULL OR p.organization_id<>inv.organization_id OR p.currency<>inv.currency OR p.status<>'CONFIRMED' OR inv.status='CANCELLED'
 THEN RAISE EXCEPTION 'core: allocation organization/currency/status mismatch' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount),0) INTO allocated FROM core.payment_allocations WHERE payment_id=p.id AND id<>NEW.id;
 IF allocated+NEW.amount>p.amount THEN RAISE EXCEPTION 'core: payment overallocated' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(a.amount),0) INTO allocated FROM core.payment_allocations a JOIN core.payments x ON x.id=a.payment_id
 WHERE a.invoice_id=NEW.invoice_id AND a.id<>NEW.id AND x.status='CONFIRMED';
 IF allocated+NEW.amount>inv.amount THEN RAISE EXCEPTION 'core: invoice overpaid' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION core.guard_invoice_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE inv record; sub_currency text; matched boolean;
BEGIN
 SELECT i.amount,i.currency,i.subscription_id INTO inv
 FROM operations.subscription_invoices i WHERE i.id=NEW.invoice_id FOR UPDATE;
 IF FOUND AND inv.subscription_id IS NOT NULL THEN
  SELECT s.currency INTO sub_currency FROM operations.subscriptions s WHERE s.id=inv.subscription_id FOR UPDATE;
 END IF;
 SELECT (l.direction='RECEIVABLE' AND l.scope='EMPRESA' AND l.currency=coalesce(sub_currency,inv.currency) AND l.amount=inv.amount) INTO matched
 FROM finance.ledger_entries l WHERE l.id=NEW.ledger_entry_id FOR UPDATE;
 IF inv.amount IS NULL OR matched IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'core: invoice and receivable amount/currency/scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
