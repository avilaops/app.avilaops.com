-- Somente para banco descartável vazio, antes das migrations core.
INSERT INTO operations.organizations(id,name,slug,status,updated_at) VALUES
 ('core-fixture-org','Core fixture','core-fixture-org','ACTIVE',now());
INSERT INTO public.portal_clients(id,nome,email,senha_hash,senha_provisoria,role,organization_id,ativo) VALUES
 ('core-fixture-user','Core fixture','core-fixture@example.invalid','fixture-no-password',true,'ADMIN','core-fixture-org',true),
 ('core-fixture-unbound','Unbound fixture','core-unbound@example.invalid','fixture-no-password',true,'CLIENT',NULL,true);
INSERT INTO operations.subscriptions(id,organization_id,description,amount,currency,billing_day,billing_cycle,status,started_at,product_key,product_tenant_id,updated_at) VALUES
 ('core-fixture-sub','core-fixture-org','Annual fixture',1200,'USD',10,'YEARLY','ACTIVE',now(),'LOJA','core-fixture-shop',now()),
 ('core-fixture-unknown','core-fixture-org','Unclassified fixture',100,'BRL',10,'MONTHLY','ACTIVE',now(),'legacy-slug','unknown',now());
INSERT INTO operations.domains(id,organization_id,fqdn,updated_at) VALUES ('core-fixture-domain','core-fixture-org','fixture.invalid',now());
INSERT INTO operations.organization_integration_connections(id,organization_id,provider,external_id,status,updated_at) VALUES
 ('core-fixture-connection','core-fixture-org','meta','external-fixture','ACTIVE',now());
INSERT INTO operations.meta_pages(id,organization_id,page_id,name,updated_at) VALUES
 ('core-fixture-page','core-fixture-org','page-fixture','Fixture Page',now());
