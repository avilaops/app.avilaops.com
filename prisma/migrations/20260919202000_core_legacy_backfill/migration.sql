BEGIN;
SET LOCAL lock_timeout = '5s';

-- SECURITY DEFINER restrito ao espelhamento: o Auth pode escrever portal_clients
-- com papel diferente. Sem SQL dinâmico, search_path fixo, execução pública revogada.
CREATE FUNCTION core.mirror_portal_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 INSERT INTO core.identity_links(id,identity_id,issuer,subject,verified_at,source)
 VALUES ('portal:'||NEW.id,NEW.id,'portal_clients',NEW.id,now(),'LEGACY') ON CONFLICT (issuer,subject) DO NOTHING;
 UPDATE core.memberships SET status='REVOKED',updated_at=now()
 WHERE identity_id=NEW.id AND source='LEGACY' AND status<>'REVOKED'
 AND (organization_id IS DISTINCT FROM NEW.organization_id OR NEW.role NOT IN ('ADMIN','CLIENT'));
 IF NEW.organization_id IS NOT NULL AND NEW.role IN ('ADMIN','CLIENT')
 AND EXISTS(SELECT 1 FROM operations.organizations WHERE id=NEW.organization_id) THEN
  INSERT INTO core.memberships(id,identity_id,organization_id,role,status,source)
  VALUES ('legacy:'||md5(NEW.id||':'||NEW.organization_id),NEW.id,NEW.organization_id,
          CASE WHEN NEW.role='ADMIN' THEN 'ADMIN' ELSE 'MEMBER' END,
          CASE WHEN NEW.ativo THEN 'ACTIVE' ELSE 'SUSPENDED' END,'LEGACY')
  ON CONFLICT (identity_id,organization_id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,updated_at=now()
  WHERE core.memberships.source='LEGACY';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION core.mirror_portal_identity() FROM PUBLIC;
CREATE TRIGGER core_portal_identity_mirror AFTER INSERT OR UPDATE OF organization_id,role,ativo ON public.portal_clients
FOR EACH ROW EXECUTE FUNCTION core.mirror_portal_identity();

INSERT INTO core.identity_links(id,identity_id,issuer,subject,verified_at,source)
SELECT 'portal:'||id,id,'portal_clients',id,now(),'LEGACY' FROM public.portal_clients;

INSERT INTO core.memberships(id,identity_id,organization_id,role,status,source)
SELECT 'legacy:'||md5(p.id||':'||p.organization_id),p.id,p.organization_id,
 CASE WHEN p.role='ADMIN' THEN 'ADMIN' ELSE 'MEMBER' END,
 CASE WHEN p.ativo THEN 'ACTIVE' ELSE 'SUSPENDED' END,'LEGACY'
FROM public.portal_clients p JOIN operations.organizations o ON o.id=p.organization_id
WHERE p.role IN ('ADMIN','CLIENT');

INSERT INTO core.reconciliation_issues(id,entity_type,entity_id,code)
SELECT 'account:'||p.id,'portal_clients',p.id,'ORGANIZATION_UNRESOLVED'
FROM public.portal_clients p LEFT JOIN operations.organizations o ON o.id=p.organization_id
WHERE p.role IN ('ADMIN','CLIENT') AND o.id IS NULL;

-- Somente identificadores de produto já explícitos e com significado conhecido.
INSERT INTO core.products(id,organization_id,product_key,tenant_id,source)
SELECT 'subscription-product:'||s.id,s.organization_id,s.product_key,s.product_tenant_id,'LEGACY_SUBSCRIPTION'
FROM operations.subscriptions s
WHERE s.product_key IN ('LOJA','MAIL','COMANDEIRO','SITE') AND nullif(btrim(s.product_tenant_id),'') IS NOT NULL;

INSERT INTO core.contracts(id,organization_id,product_id,legacy_subscription_id,description,amount,currency,billing_cycle,billing_day,status,source,starts_at,ends_at)
SELECT 'subscription:'||s.id,s.organization_id,p.id,s.id,s.description,s.amount,s.currency,s.billing_cycle,s.billing_day,s.status,'LEGACY_SNAPSHOT',s.started_at AT TIME ZONE 'UTC',s.ended_at AT TIME ZONE 'UTC'
FROM operations.subscriptions s LEFT JOIN core.products p ON p.id='subscription-product:'||s.id
WHERE s.status IN ('ACTIVE','PAUSED','CANCELLED') AND s.currency ~ '^[A-Z]{3}$' AND s.amount>=0
AND s.billing_cycle IN ('MONTHLY','YEARLY','ONE_TIME','TWO_YEARS','FOUR_YEARS','NONE')
AND s.billing_day BETWEEN 1 AND 28 AND (s.ended_at IS NULL OR s.ended_at>=s.started_at);

INSERT INTO core.reconciliation_issues(id,entity_type,entity_id,code)
SELECT 'subscription-product:'||s.id,'subscriptions',s.id,'PRODUCT_UNRESOLVED'
FROM operations.subscriptions s LEFT JOIN core.products p ON p.id='subscription-product:'||s.id WHERE p.id IS NULL;
INSERT INTO core.reconciliation_issues(id,entity_type,entity_id,code)
SELECT 'subscription-terms:'||s.id,'subscriptions',s.id,'CONTRACT_TERMS_UNSUPPORTED'
FROM operations.subscriptions s LEFT JOIN core.contracts c ON c.legacy_subscription_id=s.id WHERE c.id IS NULL;

-- Não transfere ciphertext nem atribui autor/proprietário desconhecido.
INSERT INTO core.external_accounts(id,provider,namespace,external_id,display_name)
SELECT DISTINCT ON (provider,external_id) 'legacy-account:'||md5(provider||':'||external_id),provider,'legacy',external_id,account_name
FROM operations.organization_integration_connections WHERE nullif(btrim(external_id),'') IS NOT NULL ORDER BY provider,external_id,id;
INSERT INTO core.connections(id,organization_id,external_account_id,legacy_connection_id)
SELECT 'legacy-connection:'||l.id,l.organization_id,a.id,l.id
FROM operations.organization_integration_connections l JOIN core.external_accounts a ON a.provider=l.provider AND a.namespace='legacy' AND a.external_id=l.external_id;
INSERT INTO core.reconciliation_issues(id,entity_type,entity_id,code)
SELECT 'connection:'||l.id,'organization_integration_connections',l.id,'EXTERNAL_ACCOUNT_UNRESOLVED'
FROM operations.organization_integration_connections l WHERE nullif(btrim(l.external_id),'') IS NULL;

-- Os registros existentes provam associação operacional, não ownership OAuth.
INSERT INTO core.external_assets(id,provider,namespace,kind,external_id,display_name,source)
SELECT 'domain:'||id,'dns','fqdn','DOMAIN',lower(fqdn),fqdn,'LEGACY_DOMAIN' FROM operations.domains;
INSERT INTO core.asset_grants(id,organization_id,asset_id,role,status,source)
SELECT 'domain-grant:'||id,organization_id,'domain:'||id,'MANAGER','PENDING','LEGACY_DOMAIN' FROM operations.domains;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC;
COMMIT;
