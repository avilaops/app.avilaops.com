BEGIN;
SET LOCAL lock_timeout = '5s';

REVOKE ALL ON SCHEMA core FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA core FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA core FROM PUBLIC;

ALTER TABLE core.memberships
 ADD CONSTRAINT membership_role CHECK (role IN ('ADMIN','MEMBER')),
 ADD CONSTRAINT membership_status CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
 ADD CONSTRAINT membership_dates CHECK (ends_at IS NULL OR ends_at >= starts_at);
ALTER TABLE core.products
 ADD CONSTRAINT product_status CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','CANCELLED')),
 ADD CONSTRAINT product_usage CHECK (usage_kind IN ('UNCLASSIFIED','PAID','TRIAL','COURTESY','INTERNAL')),
 ADD CONSTRAINT product_identity CHECK (btrim(product_key) <> '' AND btrim(tenant_id) <> '' AND btrim(environment) <> '');
ALTER TABLE core.product_access
 ADD CONSTRAINT product_access_role CHECK (role IN ('ADMIN','MEMBER','VIEWER')),
 ADD CONSTRAINT product_access_status CHECK (status IN ('ACTIVE','REVOKED'));
ALTER TABLE core.external_accounts ADD CONSTRAINT external_account_identity CHECK (btrim(provider) <> '' AND btrim(namespace) <> '' AND btrim(external_id) <> '');
ALTER TABLE core.identity_links ADD CONSTRAINT identity_link_subject CHECK (btrim(issuer) <> '' AND btrim(subject) <> '');
ALTER TABLE core.connections
 ADD CONSTRAINT connection_status CHECK (status IN ('PENDING','AUTHORIZED','ERROR','EXPIRED','REVOKED')),
 ADD CONSTRAINT connection_credential CHECK (num_nonnulls(credential_id,legacy_connection_id) <= 1),
 ADD CONSTRAINT connection_revocation CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL);
ALTER TABLE core.external_assets
 ADD CONSTRAINT external_asset_identity CHECK (btrim(provider) <> '' AND btrim(namespace) <> '' AND btrim(kind) <> '' AND btrim(external_id) <> ''),
 ADD CONSTRAINT ownership_evidence_required CHECK (owner_organization_id IS NULL OR nullif(btrim(ownership_evidence),'') IS NOT NULL);
ALTER TABLE core.asset_grants
 ADD CONSTRAINT asset_grant_role CHECK (role IN ('MANAGER','VIEWER')),
 ADD CONSTRAINT asset_grant_status CHECK (status IN ('PENDING','ACTIVE','REVOKED'));
ALTER TABLE core.sync_states
 ADD CONSTRAINT sync_staleness CHECK (stale_after_seconds > 0),
 ADD CONSTRAINT sync_status CHECK (status IN ('UNKNOWN','RUNNING','SUCCESS','ERROR'));
ALTER TABLE core.contracts
 ADD CONSTRAINT contract_amount CHECK (amount >= 0),
 ADD CONSTRAINT contract_currency CHECK (currency ~ '^[A-Z]{3}$'),
 ADD CONSTRAINT contract_cycle CHECK (billing_cycle IN ('MONTHLY','YEARLY','ONE_TIME','TWO_YEARS','FOUR_YEARS','NONE')),
 ADD CONSTRAINT contract_billing_day CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 28),
 ADD CONSTRAINT contract_status CHECK (status IN ('DRAFT','ACTIVE','PAUSED','CANCELLED','EXPIRED')),
 ADD CONSTRAINT contract_version CHECK (terms_version > 0),
 ADD CONSTRAINT contract_dates CHECK (ends_at IS NULL OR ends_at >= starts_at);
ALTER TABLE core.payments
 ADD CONSTRAINT payment_amount CHECK (amount > 0),
 ADD CONSTRAINT payment_currency CHECK (currency ~ '^[A-Z]{3}$'),
 ADD CONSTRAINT payment_status CHECK (status IN ('PENDING','CONFIRMED','REFUNDED','FAILED','CANCELLED')),
 ADD CONSTRAINT payment_confirmation CHECK (status NOT IN ('CONFIRMED','REFUNDED') OR paid_at IS NOT NULL),
 ADD CONSTRAINT payment_reference CHECK (btrim(provider) <> '' AND btrim(provider_account) <> '' AND btrim(external_id) <> '');
ALTER TABLE core.payment_allocations ADD CONSTRAINT allocation_amount CHECK (amount > 0);
ALTER TABLE core.inbox_events
 ADD CONSTRAINT inbox_status CHECK (status IN ('PENDING','PROCESSING','DONE','DEAD')),
 ADD CONSTRAINT inbox_attempts CHECK (attempts >= 0),
 ADD CONSTRAINT inbox_lease CHECK (status <> 'PROCESSING' OR (locked_until IS NOT NULL AND locked_by IS NOT NULL AND lease_token IS NOT NULL));
ALTER TABLE core.outbox_events
 ADD CONSTRAINT outbox_status CHECK (status IN ('PENDING','PROCESSING','DONE','DEAD')),
 ADD CONSTRAINT outbox_attempts CHECK (attempts >= 0),
 ADD CONSTRAINT outbox_lease CHECK (status <> 'PROCESSING' OR (locked_until IS NOT NULL AND locked_by IS NOT NULL AND lease_token IS NOT NULL));
ALTER TABLE core.reconciliation_issues ADD CONSTRAINT issue_status CHECK (status IN ('OPEN','RESOLVED','IGNORED'));

-- Auditoria automática somente de entidades sem tokens/payloads secretos.
CREATE FUNCTION core.audit_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 INSERT INTO core.audit_events(entity_type,entity_id,action,actor_id,database_role,before_data,after_data)
 VALUES (TG_TABLE_NAME,CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,TG_OP,
         nullif(current_setting('core.actor_id',true),''),session_user,
         CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,
         CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 RETURN NULL;
END $$;
CREATE TRIGGER memberships_audit AFTER INSERT OR UPDATE OR DELETE ON core.memberships FOR EACH ROW EXECUTE FUNCTION core.audit_change();
CREATE TRIGGER contracts_audit AFTER INSERT OR UPDATE OR DELETE ON core.contracts FOR EACH ROW EXECUTE FUNCTION core.audit_change();
CREATE TRIGGER product_access_audit AFTER INSERT OR UPDATE OR DELETE ON core.product_access FOR EACH ROW EXECUTE FUNCTION core.audit_change();
CREATE TRIGGER asset_grants_audit AFTER INSERT OR UPDATE OR DELETE ON core.asset_grants FOR EACH ROW EXECUTE FUNCTION core.audit_change();
CREATE TRIGGER payments_audit AFTER INSERT OR UPDATE OR DELETE ON core.payments FOR EACH ROW EXECUTE FUNCTION core.audit_change();
CREATE TRIGGER allocations_audit AFTER INSERT OR UPDATE OR DELETE ON core.payment_allocations FOR EACH ROW EXECUTE FUNCTION core.audit_change();

CREATE FUNCTION core.guard_connection() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.legacy_connection_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM operations.organization_integration_connections l
  JOIN core.external_accounts a ON a.id=NEW.external_account_id
  WHERE l.id=NEW.legacy_connection_id AND l.organization_id=NEW.organization_id AND l.provider=a.provider
 ) THEN RAISE EXCEPTION 'core: legacy connection belongs to another organization/provider' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER connection_guard BEFORE INSERT OR UPDATE ON core.connections FOR EACH ROW EXECUTE FUNCTION core.guard_connection();

CREATE FUNCTION core.guard_asset() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.external_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM core.external_accounts a WHERE a.id=NEW.external_account_id AND a.provider=NEW.provider AND a.namespace=NEW.namespace)
 THEN RAISE EXCEPTION 'core: asset/account namespace mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER asset_guard BEFORE INSERT OR UPDATE ON core.external_assets FOR EACH ROW EXECUTE FUNCTION core.guard_asset();

CREATE FUNCTION core.guard_asset_grant() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.connection_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM core.connections c JOIN core.external_accounts a ON a.id=c.external_account_id
 JOIN core.external_assets x ON x.id=NEW.asset_id
 WHERE c.id=NEW.connection_id AND c.organization_id=NEW.organization_id AND a.provider=x.provider AND a.namespace=x.namespace
 AND (x.external_account_id IS NULL OR x.external_account_id=a.id))
 THEN RAISE EXCEPTION 'core: grant connection cannot represent this asset' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER asset_grant_guard BEFORE INSERT OR UPDATE ON core.asset_grants FOR EACH ROW EXECUTE FUNCTION core.guard_asset_grant();

CREATE FUNCTION core.guard_contract() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' AND
 (NEW.amount,NEW.currency,NEW.billing_cycle,NEW.billing_day,NEW.organization_id,NEW.starts_at,NEW.plan_id,NEW.terms_version)
 IS DISTINCT FROM (OLD.amount,OLD.currency,OLD.billing_cycle,OLD.billing_day,OLD.organization_id,OLD.starts_at,OLD.plan_id,OLD.terms_version)
 THEN RAISE EXCEPTION 'core: agreed terms are immutable; create a new contract version' USING ERRCODE='23514'; END IF;
 IF NEW.legacy_subscription_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM operations.subscriptions s WHERE s.id=NEW.legacy_subscription_id AND s.organization_id=NEW.organization_id)
 THEN RAISE EXCEPTION 'core: subscription belongs to another organization' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_guard BEFORE INSERT OR UPDATE ON core.contracts FOR EACH ROW EXECUTE FUNCTION core.guard_contract();

CREATE FUNCTION core.guard_invoice_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE matched boolean;
BEGIN
 SELECT (l.direction='RECEIVABLE' AND l.scope='EMPRESA' AND l.currency=s.currency AND l.amount=i.amount) INTO matched
 FROM operations.subscription_invoices i JOIN operations.subscriptions s ON s.id=i.subscription_id
 JOIN finance.ledger_entries l ON l.id=NEW.ledger_entry_id WHERE i.id=NEW.invoice_id
 FOR UPDATE OF i,l,s;
 IF matched IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'core: invoice and receivable amount/currency/scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_ledger_guard BEFORE INSERT OR UPDATE ON core.invoice_ledger_links FOR EACH ROW EXECUTE FUNCTION core.guard_invoice_ledger();

CREATE FUNCTION core.guard_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE p core.payments%ROWTYPE; inv record; allocated numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.payment_id,NEW.invoice_id) IS DISTINCT FROM (OLD.payment_id,OLD.invoice_id)
 THEN RAISE EXCEPTION 'core: allocation references are immutable' USING ERRCODE='23514'; END IF;
 -- Mesma ordem de locks em todas as alocações; serializa disputas pelo saldo.
 SELECT * INTO p FROM core.payments WHERE id=NEW.payment_id FOR UPDATE;
 SELECT i.amount,s.organization_id,s.currency,i.status INTO inv FROM operations.subscription_invoices i
 JOIN operations.subscriptions s ON s.id=i.subscription_id WHERE i.id=NEW.invoice_id FOR UPDATE OF i,s;
 IF p.id IS NULL OR inv IS NULL OR p.organization_id<>inv.organization_id OR p.currency<>inv.currency OR p.status<>'CONFIRMED' OR inv.status='CANCELLED'
 THEN RAISE EXCEPTION 'core: allocation organization/currency/status mismatch' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount),0) INTO allocated FROM core.payment_allocations WHERE payment_id=p.id AND id<>NEW.id;
 IF allocated+NEW.amount>p.amount THEN RAISE EXCEPTION 'core: payment overallocated' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(a.amount),0) INTO allocated FROM core.payment_allocations a JOIN core.payments x ON x.id=a.payment_id
 WHERE a.invoice_id=NEW.invoice_id AND a.id<>NEW.id AND x.status='CONFIRMED';
 IF allocated+NEW.amount>inv.amount THEN RAISE EXCEPTION 'core: invoice overpaid' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_guard BEFORE INSERT OR UPDATE ON core.payment_allocations FOR EACH ROW EXECUTE FUNCTION core.guard_allocation();

CREATE FUNCTION core.guard_payment_update() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM core.payment_allocations WHERE payment_id=OLD.id) AND
 ((NEW.organization_id,NEW.currency,NEW.amount) IS DISTINCT FROM (OLD.organization_id,OLD.currency,OLD.amount) OR NEW.status NOT IN ('CONFIRMED','REFUNDED'))
 THEN RAISE EXCEPTION 'core: allocated payment cannot change organization/currency/amount or regress' USING ERRCODE='23514'; END IF;
 IF OLD.status='REFUNDED' AND NEW.status<>'REFUNDED' THEN RAISE EXCEPTION 'core: refund cannot be undone' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_update_guard BEFORE UPDATE ON core.payments FOR EACH ROW EXECUTE FUNCTION core.guard_payment_update();

-- Fechar a porta inversa: editar os registros antigos também respeita os vínculos.
CREATE FUNCTION core.guard_legacy_finance() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='ledger_entries' THEN
  IF (NEW.amount,NEW.currency,NEW.direction,NEW.scope) IS DISTINCT FROM (OLD.amount,OLD.currency,OLD.direction,OLD.scope)
   AND EXISTS(SELECT 1 FROM core.invoice_ledger_links WHERE ledger_entry_id=OLD.id)
  THEN RAISE EXCEPTION 'core: linked receivable terms cannot change' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='subscription_invoices' THEN
  IF ((NEW.amount,NEW.subscription_id) IS DISTINCT FROM (OLD.amount,OLD.subscription_id) OR NEW.status='CANCELLED')
   AND (EXISTS(SELECT 1 FROM core.invoice_ledger_links WHERE invoice_id=OLD.id) OR EXISTS(SELECT 1 FROM core.payment_allocations WHERE invoice_id=OLD.id))
  THEN RAISE EXCEPTION 'core: linked invoice terms cannot change/cancel' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='subscriptions' THEN
  IF (NEW.organization_id,NEW.currency) IS DISTINCT FROM (OLD.organization_id,OLD.currency)
   AND (EXISTS(SELECT 1 FROM core.contracts WHERE legacy_subscription_id=OLD.id)
    OR EXISTS(SELECT 1 FROM operations.subscription_invoices i JOIN core.payment_allocations a ON a.invoice_id=i.id WHERE i.subscription_id=OLD.id)
    OR EXISTS(SELECT 1 FROM operations.subscription_invoices i JOIN core.invoice_ledger_links l ON l.invoice_id=i.id WHERE i.subscription_id=OLD.id))
  THEN RAISE EXCEPTION 'core: linked subscription organization/currency cannot change' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER core_ledger_guard BEFORE UPDATE ON finance.ledger_entries FOR EACH ROW EXECUTE FUNCTION core.guard_legacy_finance();
CREATE TRIGGER core_invoice_guard BEFORE UPDATE ON operations.subscription_invoices FOR EACH ROW EXECUTE FUNCTION core.guard_legacy_finance();
CREATE TRIGGER core_subscription_guard BEFORE UPDATE ON operations.subscriptions FOR EACH ROW EXECUTE FUNCTION core.guard_legacy_finance();

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC;
COMMIT;
