-- Normaliza a origem do endereço antes de o domínio ser fechado.
--
-- A migração seguinte (20261001200000_cadastro_e_fiscal_do_cliente) cria a
-- restrição `organization_addresses_origem_dominio` sem normalizar antes o que
-- já está gravado — ao contrário do que faz com `type` e `status`. Banco vazio
-- não percebe; o de produção tem endereço com a origem escrita como o código
-- antigo gravava ("Receita Federal (CNPJ)", "CNPJ_LOOKUP"), e a restrição
-- derruba a migração inteira no meio do deploy.
--
-- Entra como migração própria, com horário anterior, em vez de corrigir a
-- seguinte: quem já aplicou a 20261001200000 roda esta depois e ela não acha
-- nada para mudar.
--
-- Valor fora da lista é registrado na auditoria antes de ser normalizado, como
-- a migração seguinte faz com as outras colunas: ninguém perde o que estava
-- escrito. `FICHA_PDF` fica como está — é origem legítima, admitida pela
-- 20261001220000_origem_ficha_pdf.

INSERT INTO operations.audit_events (organization_id, action, entity_type, entity_id, metadata)
SELECT organization_id, 'CADASTRO_VALOR_FORA_DO_DOMINIO', 'organization_addresses', id,
       jsonb_build_object(
         'coluna', 'source',
         'valor_anterior', source,
         'normalizado_para',
           CASE WHEN source IN ('Receita Federal (CNPJ)', 'CNPJ_LOOKUP') THEN 'RECEITA_FEDERAL' END)
  FROM operations.organization_addresses
 WHERE source IS NOT NULL
   AND source NOT IN ('MANUAL', 'RECEITA_FEDERAL', 'SEFAZ', 'CEP', 'IMPORTACAO', 'FICHA_PDF');

-- As duas grafias antigas da consulta de CNPJ viram o valor do domínio. O que
-- sobrar é origem desconhecida: fica nula, que é o que a restrição admite para
-- "não se sabe", em vez de afirmar uma procedência que ninguém conferiu.
UPDATE operations.organization_addresses
   SET source = CASE WHEN source IN ('Receita Federal (CNPJ)', 'CNPJ_LOOKUP') THEN 'RECEITA_FEDERAL' END
 WHERE source IS NOT NULL
   AND source NOT IN ('MANUAL', 'RECEITA_FEDERAL', 'SEFAZ', 'CEP', 'IMPORTACAO', 'FICHA_PDF');
