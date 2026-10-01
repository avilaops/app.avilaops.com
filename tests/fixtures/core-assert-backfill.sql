BEGIN READ ONLY;
DO $$ BEGIN
 IF (SELECT count(*) FROM core.identity_links WHERE identity_id LIKE 'core-fixture-%')<>2 THEN RAISE EXCEPTION 'identity backfill failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.effective_memberships WHERE identity_id='core-fixture-user' AND organization_id='core-fixture-org' AND role='ADMIN') THEN RAISE EXCEPTION 'membership backfill failed'; END IF;
 IF EXISTS(SELECT 1 FROM core.memberships WHERE identity_id='core-fixture-unbound') THEN RAISE EXCEPTION 'guessed membership'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.contracts WHERE legacy_subscription_id='core-fixture-sub' AND currency='USD' AND billing_cycle='YEARLY' AND amount=1200 AND product_id IS NOT NULL) THEN RAISE EXCEPTION 'contract terms lost'; END IF;
 IF EXISTS(SELECT 1 FROM core.products WHERE product_key='legacy-slug') THEN RAISE EXCEPTION 'guessed product'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.reconciliation_issues WHERE entity_id='core-fixture-unknown' AND code='PRODUCT_UNRESOLVED') THEN RAISE EXCEPTION 'missing unresolved issue'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.connections WHERE legacy_connection_id='core-fixture-connection' AND status='PENDING' AND credential_id IS NULL AND authorized_by_id IS NULL) THEN RAISE EXCEPTION 'unsafe connection backfill'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.external_assets WHERE external_id='page-fixture' AND owner_organization_id IS NULL) THEN RAISE EXCEPTION 'meta asset missing or ownership guessed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.asset_grants g JOIN core.external_assets a ON a.id=g.asset_id WHERE a.external_id='page-fixture' AND g.organization_id='core-fixture-org' AND g.status='PENDING') THEN RAISE EXCEPTION 'meta grant backfill failed'; END IF;
END $$;
COMMIT;
