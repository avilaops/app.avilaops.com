-- Vínculo entre a conta de acesso e a empresa que ela representa.
-- Sem isto, "cliente" é só um papel: não há como saber o que é dele.
ALTER TABLE public.portal_clients ADD COLUMN IF NOT EXISTS organization_id text;

CREATE INDEX IF NOT EXISTS portal_clients_organization_id_idx
  ON public.portal_clients (organization_id);

-- O papel OWNER passa a existir ao lado de ADMIN e CLIENT. Nenhuma conta é
-- promovida aqui: a troca é feita depois do deploy, quando o código já aceita
-- OWNER em tudo que hoje exige ADMIN.
COMMENT ON COLUMN public.portal_clients.role IS 'OWNER | ADMIN | CLIENT';
COMMENT ON COLUMN public.portal_clients.organization_id IS 'operations.organizations.id que esta conta representa (só CLIENT)';
