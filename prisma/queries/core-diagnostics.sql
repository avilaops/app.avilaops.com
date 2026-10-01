-- Somente leitura; executar com papel interno autorizado. Não expõe segredos.
BEGIN READ ONLY;
SELECT entity_type,code,count(*) FROM core.unresolved_links GROUP BY entity_type,code ORDER BY 1,2;
SELECT organization_id,currency,outstanding,overdue,open_count FROM core.receivable_totals ORDER BY organization_id,currency;
SELECT organization_id,currency,billing_cycle,subscriptions,contracted_amount,monthly_equivalent FROM core.subscription_totals ORDER BY 1,2,3;
SELECT id,organization_id,legacy_subscription_id,contracted_amount,current_amount,contracted_currency,current_currency,contracted_cycle,current_cycle FROM core.contract_drift WHERE differs;
SELECT provider,health,count(*) FROM core.connection_health GROUP BY provider,health ORDER BY 1,2;
SELECT product_key,status,usage_kind,count(*) FROM core.products GROUP BY 1,2,3 ORDER BY 1,2,3;
SELECT 'inbox' AS queue,status,count(*) FROM core.inbox_events GROUP BY status
UNION ALL SELECT 'outbox',status,count(*) FROM core.outbox_events GROUP BY status;
SELECT count(*) AS invoices_without_ledger FROM core.unresolved_links WHERE code='LEDGER_UNLINKED';
COMMIT;
