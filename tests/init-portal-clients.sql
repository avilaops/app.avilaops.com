CREATE TABLE public.portal_clients (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cpf TEXT,
  telefone TEXT,
  role TEXT NOT NULL DEFAULT 'CLIENT',
  senha_hash TEXT NOT NULL DEFAULT '',
  senha_provisoria BOOLEAN NOT NULL DEFAULT false,
  organization_id TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  atualizado_em TIMESTAMP(3),
  ultimo_acesso_em TIMESTAMP(3),
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMP(3),
  email_recuperacao TEXT
);
