-- FICHA_PDF entra no domínio de origem do endereço.
--
-- O domínio fechado de `source` (20261001200000) e a leitura da ficha
-- cadastral em PDF (#64) foram escritos em paralelo e mesclados no mesmo dia:
-- cada um passou sozinho, e juntos o cadastro por ficha quebrava no banco com
-- "violates check constraint organization_addresses_origem_dominio".
--
-- FICHA_PDF é procedência tão legítima quanto RECEITA_FEDERAL ou CEP: diz que
-- aquele endereço veio do documento que o cliente mandou, e é o que permite
-- saber depois de onde cada campo veio. O domínio é que estava incompleto.
ALTER TABLE operations.organization_addresses
  DROP CONSTRAINT IF EXISTS organization_addresses_origem_dominio;

ALTER TABLE operations.organization_addresses
  ADD CONSTRAINT organization_addresses_origem_dominio
    CHECK (source IS NULL OR source IN ('MANUAL', 'RECEITA_FEDERAL', 'SEFAZ', 'CEP', 'IMPORTACAO', 'FICHA_PDF'));
