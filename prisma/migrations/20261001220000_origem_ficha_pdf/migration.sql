-- `FICHA_PDF` é origem de endereço legítima e ficou fora do domínio.
--
-- A migração `20261001200000_cadastro_e_fiscal_do_cliente` fechou o domínio de
-- `organization_addresses.source` em MANUAL, RECEITA_FEDERAL, SEFAZ, CEP e
-- IMPORTACAO. Ela foi escrita quando o cadastro a partir da ficha em PDF ainda
-- era PR aberto; esse PR entrou na `main` primeiro, e ele grava
-- `source = 'FICHA_PDF'`. As duas mudanças passaram no CI separadas e só
-- quebram juntas — cadastrar cliente pela ficha passou a violar o CHECK.
--
-- `source` responde "quem disse que este é o endereço". Endereço lido da ficha
-- que o cliente assinou vale mais que endereço digitado por quem atendeu, e
-- menos que o da Receita: tem lugar na lista por mérito, não por conveniência.
--
-- Migração nova em vez de corrigir o arquivo anterior: aquele já está na
-- `main`, e mexer no texto de uma migração registrada muda o checksum que o
-- Prisma guarda em `_prisma_migrations` — o `migrate deploy` seguinte falharia
-- em qualquer banco que já a tenha aplicado.

ALTER TABLE operations.organization_addresses
  DROP CONSTRAINT IF EXISTS organization_addresses_origem_dominio;

ALTER TABLE operations.organization_addresses
  ADD CONSTRAINT organization_addresses_origem_dominio
    CHECK (source IS NULL OR source IN
      ('MANUAL', 'FICHA_PDF', 'RECEITA_FEDERAL', 'SEFAZ', 'CEP', 'IMPORTACAO'));
