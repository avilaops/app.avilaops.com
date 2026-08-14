-- Colunas de recuperação de senha para portal_clients (schema public,
-- tabela compartilhada com cliente.avila.inc).
ALTER TABLE "public"."portal_clients"
  ADD COLUMN IF NOT EXISTS "reset_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "reset_token_expires_at" TIMESTAMPTZ(3);
