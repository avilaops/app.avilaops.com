-- Gerenciador de usuários, v1.
--
-- `portal_clients` é a tabela de contas de toda a casa (app, auth, SSO). Ela
-- nasceu do portal antigo e cresceu sem os campos que uma gestão de usuário
-- precisa: não dava para desligar alguém sem apagar a linha, nem saber quando
-- a conta entrou pela última vez, nem quando foi mexida.
--
-- Nada aqui é destrutivo: colunas novas com padrão, e índices para a listagem
-- do painel não varrer a tabela.

ALTER TABLE public.portal_clients ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE public.portal_clients ADD COLUMN IF NOT EXISTS atualizado_em timestamp(3);
ALTER TABLE public.portal_clients ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamp(3);

-- O login procura por e-mail em minúsculas; sem o índice funcional é varredura.
CREATE INDEX IF NOT EXISTS portal_clients_email_lower_idx ON public.portal_clients (lower(email));
CREATE INDEX IF NOT EXISTS portal_clients_role_idx ON public.portal_clients (role);
CREATE INDEX IF NOT EXISTS portal_clients_ativo_idx ON public.portal_clients (ativo);

COMMENT ON COLUMN public.portal_clients.ativo IS 'false = conta desligada: não entra em lugar nenhum, mas o histórico fica';
COMMENT ON COLUMN public.portal_clients.ultimo_acesso_em IS 'gravado pelo login; serve para achar conta esquecida';
