-- Quem serve o DNS de cada domínio.
--
-- Até aqui o único sinal era `cloudflare_zone_id` não nulo, que é o nome de um
-- fornecedor gravado no schema. Enquanto havia um só serviço isso passava; para
-- migrar domínio a domínio para o DNS da casa é preciso dizer, por domínio,
-- quem responde por ele — senão a migração vira um interruptor global e o
-- primeiro erro atinge a carteira inteira.
--
-- Três valores:
--   NENHUM   o domínio está sob gestão, mas a casa não serve o DNS dele
--   EXTERNO  servido por um provedor de fora
--   AVILA    servido pelo DNS da casa
--
-- Aditiva e com backfill pelo sinal que já existe. Nenhum domínio nasce AVILA:
-- isso só acontece por migração explícita, um de cada vez.
ALTER TABLE "operations"."domains"
  ADD COLUMN IF NOT EXISTS "dns_provider" TEXT NOT NULL DEFAULT 'NENHUM';

UPDATE "operations"."domains"
  SET "dns_provider" = 'EXTERNO'
  WHERE "cloudflare_zone_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "domains_dns_provider_idx"
  ON "operations"."domains" ("dns_provider");
