ALTER TABLE operations.subscription_invoices
  ADD COLUMN organization_id text,
  ADD COLUMN description text,
  ADD COLUMN currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN automatic_nfse boolean NOT NULL DEFAULT false,
  ADD COLUMN fiscal_service_code text,
  ADD COLUMN fiscal_description text;

UPDATE operations.subscription_invoices invoice
SET organization_id=subscription.organization_id,
    description=subscription.description,
    currency=subscription.currency
FROM operations.subscriptions subscription
WHERE subscription.id=invoice.subscription_id;

ALTER TABLE operations.subscription_invoices
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN subscription_id DROP NOT NULL,
  ADD CONSTRAINT subscription_invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES operations.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT subscription_invoices_custom_shape CHECK (
    (kind='CUSTOM' AND subscription_id IS NULL) OR
    (kind<>'CUSTOM' AND subscription_id IS NOT NULL)
  ),
  ADD CONSTRAINT subscription_invoices_currency_check CHECK (currency='BRL'),
  ADD CONSTRAINT subscription_invoices_fiscal_code_check CHECK (fiscal_service_code IS NULL OR fiscal_service_code ~ '^[0-9]{6}$');

CREATE INDEX subscription_invoices_organization_id_status_due_date_idx
  ON operations.subscription_invoices(organization_id,status,due_date);
