BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE VIEW core.effective_memberships AS
SELECT m.id,m.identity_id,m.organization_id,m.role,m.source,m.starts_at,m.ends_at
FROM core.memberships m JOIN public.portal_clients p ON p.id=m.identity_id
JOIN operations.organizations o ON o.id=m.organization_id
WHERE p.ativo AND m.status='ACTIVE' AND m.starts_at<=statement_timestamp()
AND (m.ends_at IS NULL OR m.ends_at>statement_timestamp()) AND o.status<>'ARCHIVED';

CREATE VIEW core.effective_product_access AS
SELECT a.id,m.identity_id,a.organization_id,a.product_id,a.role
FROM core.product_access a JOIN core.effective_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id
JOIN core.products p ON p.id=a.product_id AND p.organization_id=a.organization_id
WHERE a.status='ACTIVE' AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp()) AND p.status='ACTIVE';

-- Não expõe token/ciphertext. Status legado permanece separado do novo.
CREATE VIEW core.connection_health AS
SELECT c.id,c.organization_id,a.provider,a.namespace,a.external_id,c.status,
 c.authorized_by_id,c.expires_at,c.revoked_at,l.status AS legacy_status,
 s.resource,s.last_attempt_at,s.last_success_at,s.error_code,
 CASE WHEN c.revoked_at IS NOT NULL OR c.status='REVOKED' THEN 'REVOKED'
 WHEN c.expires_at<=statement_timestamp() THEN 'EXPIRED'
 WHEN c.status<>'AUTHORIZED' THEN c.status
 WHEN s.status='ERROR' THEN 'ERROR'
 WHEN s.last_success_at IS NULL THEN 'UNKNOWN'
 WHEN s.last_success_at+make_interval(secs=>s.stale_after_seconds)<=statement_timestamp() THEN 'STALE'
 ELSE 'CURRENT' END AS health
FROM core.connections c JOIN core.external_accounts a ON a.id=c.external_account_id
LEFT JOIN operations.organization_integration_connections l ON l.id=c.legacy_connection_id
LEFT JOIN core.sync_states s ON s.connection_id=c.id;

-- Total sem limite de paginação, nunca mistura moedas e não duplica ledger ligado.
CREATE VIEW core.receivables AS
WITH allocated AS (
 SELECT a.invoice_id,sum(a.amount) AS amount FROM core.payment_allocations a
 JOIN core.payments p ON p.id=a.payment_id WHERE p.status='CONFIRMED' GROUP BY a.invoice_id
)
SELECT 'INVOICE'::text AS source,i.id AS source_id,s.organization_id,s.currency,
 i.amount,i.due_date,
 CASE WHEN i.status IN ('PAID','CANCELLED') THEN 0::numeric ELSE greatest(i.amount-coalesce(a.amount,0),0) END AS outstanding,
 CASE WHEN i.status IN ('PAID','CANCELLED') THEN i.status
      WHEN coalesce(a.amount,0)>=i.amount THEN 'AWAITING_RECONCILIATION'
      WHEN i.due_date<(statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE 'OPEN' END AS effective_status
FROM operations.subscription_invoices i JOIN operations.subscriptions s ON s.id=i.subscription_id
LEFT JOIN allocated a ON a.invoice_id=i.id
UNION ALL
SELECT 'LEDGER',l.id::text,NULL::text,l.currency,l.amount,l.due_date,
 CASE WHEN l.status='OPEN' THEN l.amount ELSE 0::numeric END,
 CASE WHEN l.status='OPEN' AND l.due_date<(statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE l.status END
FROM finance.ledger_entries l
WHERE l.direction='RECEIVABLE' AND l.scope='EMPRESA'
AND NOT EXISTS(SELECT 1 FROM core.invoice_ledger_links x WHERE x.ledger_entry_id=l.id);

CREATE VIEW core.receivable_totals AS
SELECT organization_id,currency,sum(outstanding) AS outstanding,
 coalesce(sum(outstanding) FILTER (WHERE effective_status='OVERDUE'),0) AS overdue,
 count(*) FILTER (WHERE outstanding>0) AS open_count
FROM core.receivables GROUP BY organization_id,currency;

CREATE VIEW core.subscription_totals AS
SELECT organization_id,currency,billing_cycle,count(*) AS subscriptions,sum(amount) AS contracted_amount,
 sum(CASE WHEN billing_cycle='MONTHLY' THEN amount WHEN billing_cycle='YEARLY' THEN amount/12 ELSE NULL END) AS monthly_equivalent
FROM operations.subscriptions WHERE status='ACTIVE' GROUP BY organization_id,currency,billing_cycle;

CREATE VIEW core.contract_drift AS
SELECT c.id,c.organization_id,c.legacy_subscription_id,
 (c.amount,c.currency,c.billing_cycle,c.billing_day,c.status) IS DISTINCT FROM
 (s.amount,s.currency,s.billing_cycle,s.billing_day,s.status) AS differs,
 c.amount AS contracted_amount,s.amount AS current_amount,c.currency AS contracted_currency,s.currency AS current_currency,
 c.billing_cycle AS contracted_cycle,s.billing_cycle AS current_cycle
FROM core.contracts c JOIN operations.subscriptions s ON s.id=c.legacy_subscription_id;

CREATE VIEW core.unresolved_links AS
SELECT 'portal_clients'::text AS entity_type,p.id AS entity_id,'ORGANIZATION_UNRESOLVED'::text AS code
FROM public.portal_clients p LEFT JOIN operations.organizations o ON o.id=p.organization_id
WHERE p.role IN ('ADMIN','CLIENT') AND p.ativo AND o.id IS NULL
UNION ALL
SELECT 'subscriptions',s.id,'PRODUCT_UNRESOLVED' FROM operations.subscriptions s
WHERE NOT EXISTS(SELECT 1 FROM core.contracts c WHERE c.legacy_subscription_id=s.id AND c.product_id IS NOT NULL)
UNION ALL
SELECT 'domains',d.id,'EXPIRATION_UNKNOWN' FROM operations.domains d WHERE d.status<>'ARCHIVED' AND d.expires_at IS NULL
UNION ALL
SELECT 'subscription_invoices',i.id,'LEDGER_UNLINKED' FROM operations.subscription_invoices i
WHERE i.status IN ('OPEN','OVERDUE') AND NOT EXISTS(SELECT 1 FROM core.invoice_ledger_links l WHERE l.invoice_id=i.id)
UNION ALL
SELECT 'contracts',c.id,'LEGACY_TERMS_CHANGED' FROM core.contract_drift c WHERE c.differs;

CREATE FUNCTION core.can_access_organization(identity_id text, organization_id text, require_admin boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM core.effective_memberships m WHERE m.identity_id=$1 AND m.organization_id=$2 AND (NOT $3 OR m.role='ADMIN'))
$$;

CREATE FUNCTION core.claim_inbox(worker text, batch_size integer DEFAULT 10, lease_seconds integer DEFAULT 60)
RETURNS SETOF core.inbox_events LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF nullif(btrim(worker),'') IS NULL OR batch_size NOT BETWEEN 1 AND 100 OR lease_seconds NOT BETWEEN 10 AND 3600
 THEN RAISE EXCEPTION 'core: invalid worker/batch/lease' USING ERRCODE='22023'; END IF;
 UPDATE core.inbox_events SET status='DEAD',locked_by=NULL,locked_until=NULL,lease_token=NULL
 WHERE attempts>=10 AND status='PROCESSING' AND locked_until<=clock_timestamp();
 RETURN QUERY WITH candidates AS (
 SELECT e.id FROM core.inbox_events e WHERE e.attempts<10 AND
 ((e.status='PENDING' AND e.available_at<=clock_timestamp()) OR (e.status='PROCESSING' AND e.locked_until<=clock_timestamp()))
 ORDER BY e.available_at,e.id FOR UPDATE SKIP LOCKED LIMIT batch_size
 ) UPDATE core.inbox_events e SET status='PROCESSING',locked_by=worker,lease_token=gen_random_uuid()::text,
 locked_until=clock_timestamp()+make_interval(secs=>lease_seconds),attempts=e.attempts+1
 FROM candidates c WHERE e.id=c.id RETURNING e.*;
END $$;

CREATE FUNCTION core.claim_outbox(worker text, batch_size integer DEFAULT 10, lease_seconds integer DEFAULT 60)
RETURNS SETOF core.outbox_events LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF nullif(btrim(worker),'') IS NULL OR batch_size NOT BETWEEN 1 AND 100 OR lease_seconds NOT BETWEEN 10 AND 3600
 THEN RAISE EXCEPTION 'core: invalid worker/batch/lease' USING ERRCODE='22023'; END IF;
 UPDATE core.outbox_events SET status='DEAD',locked_by=NULL,locked_until=NULL,lease_token=NULL
 WHERE attempts>=10 AND status='PROCESSING' AND locked_until<=clock_timestamp();
 RETURN QUERY WITH candidates AS (
 SELECT e.id FROM core.outbox_events e WHERE e.attempts<10 AND
 ((e.status='PENDING' AND e.available_at<=clock_timestamp()) OR (e.status='PROCESSING' AND e.locked_until<=clock_timestamp()))
 ORDER BY e.available_at,e.id FOR UPDATE SKIP LOCKED LIMIT batch_size
 ) UPDATE core.outbox_events e SET status='PROCESSING',locked_by=worker,lease_token=gen_random_uuid()::text,
 locked_until=clock_timestamp()+make_interval(secs=>lease_seconds),attempts=e.attempts+1
 FROM candidates c WHERE e.id=c.id RETURNING e.*;
END $$;

CREATE FUNCTION core.finish_inbox(event_id text, token text, succeeded boolean, error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE affected integer;
BEGIN
 UPDATE core.inbox_events SET status=CASE WHEN succeeded THEN 'DONE' WHEN attempts>=10 THEN 'DEAD' ELSE 'PENDING' END,
 processed_at=CASE WHEN succeeded THEN clock_timestamp() ELSE NULL END,
 available_at=clock_timestamp()+make_interval(secs=>least(3600,attempts*attempts*10)),
 last_error_code=CASE WHEN succeeded THEN NULL ELSE left(error_code,100) END,locked_by=NULL,locked_until=NULL,lease_token=NULL
 WHERE id=event_id AND lease_token=token AND status='PROCESSING' AND locked_until>clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END $$;
CREATE FUNCTION core.finish_outbox(event_id text, token text, succeeded boolean, error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE affected integer;
BEGIN
 UPDATE core.outbox_events SET status=CASE WHEN succeeded THEN 'DONE' WHEN attempts>=10 THEN 'DEAD' ELSE 'PENDING' END,
 processed_at=CASE WHEN succeeded THEN clock_timestamp() ELSE NULL END,
 available_at=clock_timestamp()+make_interval(secs=>least(3600,attempts*attempts*10)),
 last_error_code=CASE WHEN succeeded THEN NULL ELSE left(error_code,100) END,locked_by=NULL,locked_until=NULL,lease_token=NULL
 WHERE id=event_id AND lease_token=token AND status='PROCESSING' AND locked_until>clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA core FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC;
COMMIT;
