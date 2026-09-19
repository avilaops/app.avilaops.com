-- Login proprio do Instagram: a conta passa a registrar por onde chegou e,
-- quando vem pelo login proprio, o tipo que o Instagram informa.
ALTER TABLE "operations"."instagram_accounts"
  ADD COLUMN IF NOT EXISTS "account_type" TEXT;

ALTER TABLE "operations"."instagram_accounts"
  ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'facebook';

-- Toda linha existente veio pelo caminho do Facebook; o default ja cobre, o
-- update deixa explicito para quem for ler a tabela depois.
UPDATE "operations"."instagram_accounts" SET "origem" = 'facebook' WHERE "origem" IS NULL;

CREATE INDEX IF NOT EXISTS "instagram_accounts_origem_idx"
  ON "operations"."instagram_accounts"("origem");
