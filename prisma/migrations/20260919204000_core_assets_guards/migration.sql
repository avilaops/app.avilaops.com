BEGIN;
SET LOCAL lock_timeout = '5s';

-- Namespace desconhecido do app Meta é mantido explicitamente como legado.
-- Não fundir com ativos futuros de outro app/namespace por nome ou e-mail.
CREATE TEMP TABLE core_meta_candidates ON COMMIT DROP AS
 SELECT id,'BUSINESS'::text AS kind,business_id AS external_id,name AS display_name,organization_id FROM operations.meta_business_accounts
 UNION ALL SELECT id,'PAGE',page_id,name,organization_id FROM operations.meta_pages
 UNION ALL SELECT id,'INSTAGRAM',instagram_account_id,username,organization_id FROM operations.instagram_accounts
 UNION ALL SELECT id,'AD_ACCOUNT',ad_account_id,name,organization_id FROM operations.meta_ad_accounts;

INSERT INTO core.external_assets(id,provider,namespace,kind,external_id,display_name,source)
SELECT 'meta:'||kind||':'||id,'meta','legacy-graph',kind,external_id,display_name,'LEGACY_META'
FROM core_meta_candidates;
INSERT INTO core.asset_grants(id,organization_id,asset_id,role,status,source)
SELECT 'meta-grant:'||kind||':'||id,organization_id,'meta:'||kind||':'||id,'MANAGER','PENDING','LEGACY_META'
FROM core_meta_candidates WHERE organization_id IS NOT NULL;
INSERT INTO core.reconciliation_issues(id,entity_type,entity_id,code)
SELECT 'meta:'||kind||':'||id,'meta_assets','meta:'||kind||':'||id,'ORGANIZATION_UNRESOLVED'
FROM core_meta_candidates WHERE organization_id IS NULL;

-- Não permitir que uma edição posterior contorne a validação na criação.
CREATE FUNCTION core.guard_external_parent() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='external_accounts' THEN
  IF (NEW.provider,NEW.namespace,NEW.external_id) IS DISTINCT FROM (OLD.provider,OLD.namespace,OLD.external_id)
  THEN RAISE EXCEPTION 'core: external identity is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='external_assets' THEN
  IF (NEW.provider,NEW.namespace,NEW.kind,NEW.external_id,NEW.external_account_id) IS DISTINCT FROM (OLD.provider,OLD.namespace,OLD.kind,OLD.external_id,OLD.external_account_id)
   AND EXISTS(SELECT 1 FROM core.asset_grants WHERE asset_id=OLD.id)
  THEN RAISE EXCEPTION 'core: granted asset identity is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='connections' THEN
  IF (NEW.organization_id,NEW.external_account_id) IS DISTINCT FROM (OLD.organization_id,OLD.external_account_id)
  THEN RAISE EXCEPTION 'core: connection identity is immutable; create a new authorization' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='organization_integration_connections' THEN
  IF (NEW.organization_id,NEW.provider,NEW.external_id) IS DISTINCT FROM (OLD.organization_id,OLD.provider,OLD.external_id)
   AND EXISTS(SELECT 1 FROM core.connections WHERE legacy_connection_id=OLD.id)
  THEN RAISE EXCEPTION 'core: legacy connection has a linked identity' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_account_identity_guard BEFORE UPDATE ON core.external_accounts FOR EACH ROW EXECUTE FUNCTION core.guard_external_parent();
CREATE TRIGGER external_asset_identity_guard BEFORE UPDATE ON core.external_assets FOR EACH ROW EXECUTE FUNCTION core.guard_external_parent();
CREATE TRIGGER connection_identity_guard BEFORE UPDATE ON core.connections FOR EACH ROW EXECUTE FUNCTION core.guard_external_parent();
CREATE TRIGGER core_legacy_connection_guard BEFORE UPDATE ON operations.organization_integration_connections FOR EACH ROW EXECUTE FUNCTION core.guard_external_parent();

CREATE FUNCTION core.reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'core: audit events are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON core.audit_events FOR EACH ROW EXECUTE FUNCTION core.reject_audit_mutation();

CREATE VIEW core.effective_asset_grants AS
SELECT g.id,g.organization_id,g.asset_id,g.role,c.id AS connection_id
FROM core.asset_grants g JOIN core.connections c ON c.id=g.connection_id AND c.organization_id=g.organization_id
WHERE g.status='ACTIVE' AND (g.expires_at IS NULL OR g.expires_at>CURRENT_TIMESTAMP)
AND c.status='AUTHORIZED' AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>CURRENT_TIMESTAMP);

REVOKE ALL ON ALL TABLES IN SCHEMA core FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC;
COMMIT;
