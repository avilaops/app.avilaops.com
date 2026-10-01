-- Cadastro do cliente e o bloco fiscal dele, no nível que um ERP exige.
--
-- O cadastro de hoje guarda informação, mas não garante nada. `status`, tipo de
-- endereço e tipo de contato são texto livre: qualquer palavra entra. O
-- documento é único por texto, então "33.000.167/0001-01" e "33000167000101"
-- convivem como dois clientes. Nada no banco impede um CNPJ com dígito
-- verificador errado, e a inscrição estadual mora no "perfil" — ao lado de
-- "melhor horário para contato" —, que não é lugar de dado fiscal.
--
-- O efeito prático é que não se emite NFS-e a partir deste cadastro: falta o
-- código IBGE do município (a prefeitura identifica a cidade por ele), falta o
-- indicador de inscrição estadual do destinatário, falta o regime tributário e
-- falta saber o que o cliente retém.
--
-- Esta migração fecha os domínios, põe a validação do documento dentro do
-- banco e cria a ficha fiscal do cliente, espelhando `identidade_da_casa`: lá
-- está quem emite, aqui está para quem se emite.
--
-- Aditiva no que é dado: nenhuma coluna é removida e nenhum valor é apagado. O
-- que ela acrescenta é recusa — daqui em diante o banco rejeita o que antes
-- aceitava calado.

-- ---------------------------------------------------------------------------
-- 1. Validação de CPF e CNPJ dentro do banco
-- ---------------------------------------------------------------------------
-- A aplicação já valida em `src/lib/cpf-cnpj.ts`. Isso não basta: script de
-- importação, n8n e correção manual por SQL não passam pela API, e é por ali
-- que entra o documento errado que ninguém digitou numa tela.

CREATE OR REPLACE FUNCTION operations.documento_normalizado(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS 'SELECT nullif(upper(regexp_replace(coalesce($1, ''''), ''[^0-9A-Za-z]'', '''', ''g'')), '''')';

COMMENT ON FUNCTION operations.documento_normalizado(text) IS
  'CPF/CNPJ sem pontuação e em maiúsculas. Maiúsculas porque o CNPJ alfanumérico usa letras.';

CREATE OR REPLACE FUNCTION operations.cpf_valido(valor text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $funcao$
DECLARE
  d     text;
  dig   int[];
  soma  int;
  resto int;
  i     int;
BEGIN
  d := regexp_replace(coalesce(valor, ''), '\D', '', 'g');
  IF length(d) <> 11 THEN RETURN false; END IF;
  -- 111.111.111-11 passa no módulo 11 e não é CPF de ninguém.
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;

  dig := string_to_array(d, NULL)::int[];

  soma := 0;
  FOR i IN 1..9 LOOP soma := soma + dig[i] * (11 - i); END LOOP;
  resto := (soma * 10) % 11;
  IF resto = 10 THEN resto := 0; END IF;
  IF resto <> dig[10] THEN RETURN false; END IF;

  soma := 0;
  FOR i IN 1..10 LOOP soma := soma + dig[i] * (12 - i); END LOOP;
  resto := (soma * 10) % 11;
  IF resto = 10 THEN resto := 0; END IF;
  RETURN resto = dig[11];
END
$funcao$;

CREATE OR REPLACE FUNCTION operations.cnpj_valido(valor text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $funcao$
DECLARE
  d      text;
  pesos1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma   int;
  resto  int;
  dv     int;
  i      int;
BEGIN
  d := upper(regexp_replace(coalesce(valor, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(d) <> 14 THEN RETURN false; END IF;

  -- CNPJ alfanumérico (IN RFB 2.229/2024, em vigor desde julho de 2026): as
  -- doze primeiras posições podem ter letras; os dois dígitos verificadores
  -- continuam numéricos. O cálculo é o mesmo módulo 11, com o valor de cada
  -- caractere lido como ASCII menos 48 — '0' vale 0 e 'A' vale 17.
  IF d !~ '^[0-9A-Z]{12}[0-9]{2}$' THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{13}$' THEN RETURN false; END IF;

  soma := 0;
  FOR i IN 1..12 LOOP
    soma := soma + (ascii(substr(d, i, 1)) - 48) * pesos1[i];
  END LOOP;
  resto := soma % 11;
  dv := CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END;
  IF dv <> (ascii(substr(d, 13, 1)) - 48) THEN RETURN false; END IF;

  soma := 0;
  FOR i IN 1..13 LOOP
    soma := soma + (ascii(substr(d, i, 1)) - 48) * pesos2[i];
  END LOOP;
  resto := soma % 11;
  dv := CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END;
  RETURN dv = (ascii(substr(d, 14, 1)) - 48);
END
$funcao$;

-- Nulo e vazio passam: o cliente entra no cadastro antes de informar o
-- documento. O que não passa é documento informado e errado.
CREATE OR REPLACE FUNCTION operations.documento_valido(valor text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $funcao$
  SELECT CASE
    WHEN operations.documento_normalizado(valor) IS NULL THEN true
    WHEN length(operations.documento_normalizado(valor)) = 11 THEN operations.cpf_valido(valor)
    WHEN length(operations.documento_normalizado(valor)) = 14 THEN operations.cnpj_valido(valor)
    ELSE false
  END
$funcao$;

-- ---------------------------------------------------------------------------
-- 2. O documento do cliente
-- ---------------------------------------------------------------------------
-- Normaliza o que já existe antes de exigir formato. A aplicação grava só
-- dígitos desde `classifyCpfCnpj`, mas registro antigo e importação podem ter
-- entrado com máscara.

UPDATE operations.organizations
   SET cpf_cnpj = operations.documento_normalizado(cpf_cnpj)
 WHERE cpf_cnpj IS DISTINCT FROM operations.documento_normalizado(cpf_cnpj);

-- Depois de tirar a máscara, dois cadastros podem ter virado o mesmo
-- documento. Isso é cliente duplicado, não detalhe de formato: quem resolve é
-- uma pessoa, decidindo qual ficha vale. A migração para aqui e diz quais são.
DO $bloco$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(detalhe, '; ' ORDER BY detalhe) INTO duplicados
    FROM (
      SELECT cpf_cnpj || ' -> clientes ' ||
             string_agg(client_number::text, ', ' ORDER BY client_number) AS detalhe
        FROM operations.organizations
       WHERE cpf_cnpj IS NOT NULL
       GROUP BY cpf_cnpj
      HAVING count(*) > 1
    ) AS d;

  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION
      'Documentos repetidos depois de remover a máscara: %. Unifique as fichas antes de aplicar esta migração.',
      duplicados;
  END IF;
END
$bloco$;

ALTER TABLE operations.organizations
  ADD CONSTRAINT organizations_documento_formato
    CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^[0-9]{11}$' OR cpf_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

-- `NOT VALID` de propósito: o formato acima já foi garantido pelo UPDATE, mas o
-- dígito verificador não. Um CNPJ digitado errado em 2025 continua gravado, e
-- derrubar a migração por causa dele deixaria a casa sem deploy. A regra passa
-- a valer para toda escrita nova e a view `operations.cadastro_pendencias`
-- lista quem precisa de correção. Depois de corrigidos:
-- ALTER TABLE operations.organizations VALIDATE CONSTRAINT organizations_documento_digito_verificador;
ALTER TABLE operations.organizations
  ADD CONSTRAINT organizations_documento_digito_verificador
    CHECK (operations.documento_valido(cpf_cnpj)) NOT VALID;

-- ---------------------------------------------------------------------------
-- 3. Domínios fechados do cadastro
-- ---------------------------------------------------------------------------
-- O vocabulário é o que a aplicação já usa (`STATUS_CLIENTE` em
-- `src/lib/clientes-busca.ts`, "MAIN" nos endereços, "OWNER"/"BILLING" nos
-- contatos). Fechar o domínio é o ganho; traduzir os valores para português
-- seria renomear o que circula em filtro, URL e PR aberto de outras sessões,
-- sem nada em troca.
--
-- Valor fora da lista é registrado na auditoria antes de ser normalizado:
-- ninguém perde o que estava escrito.

INSERT INTO operations.audit_events (organization_id, action, entity_type, entity_id, metadata)
SELECT id, 'CADASTRO_VALOR_FORA_DO_DOMINIO', 'organizations', id,
       jsonb_build_object('coluna', 'status', 'valor_anterior', status, 'normalizado_para', 'ACTIVE')
  FROM operations.organizations
 WHERE status IS NULL OR status NOT IN ('ACTIVE', 'ONBOARDING', 'PAUSED', 'ARCHIVED');

UPDATE operations.organizations
   SET status = 'ACTIVE'
 WHERE status IS NULL OR status NOT IN ('ACTIVE', 'ONBOARDING', 'PAUSED', 'ARCHIVED');

ALTER TABLE operations.organizations
  ADD CONSTRAINT organizations_status_dominio
    CHECK (status IN ('ACTIVE', 'ONBOARDING', 'PAUSED', 'ARCHIVED'));

INSERT INTO operations.audit_events (organization_id, action, entity_type, entity_id, metadata)
SELECT organization_id, 'CADASTRO_VALOR_FORA_DO_DOMINIO', 'organization_addresses', id,
       jsonb_build_object('coluna', 'type', 'valor_anterior', type, 'normalizado_para', 'MAIN')
  FROM operations.organization_addresses
 WHERE type IS NULL OR type NOT IN ('MAIN', 'BILLING', 'DELIVERY', 'FISCAL');

UPDATE operations.organization_addresses
   SET type = 'MAIN'
 WHERE type IS NULL OR type NOT IN ('MAIN', 'BILLING', 'DELIVERY', 'FISCAL');

ALTER TABLE operations.organization_addresses
  ADD CONSTRAINT organization_addresses_tipo_dominio
    CHECK (type IN ('MAIN', 'BILLING', 'DELIVERY', 'FISCAL'));

-- `source` responde "quem disse que este é o endereço", e por isso a lista
-- inclui `FICHA_PDF`: endereço lido da ficha cadastral que o cliente assinou
-- vale mais que endereço digitado por quem atendeu, e menos que o da Receita.
-- `MANUAL` e `FICHA_PDF` são os dois valores que a aplicação grava hoje; os
-- outros três existem porque já alimentam endereço em outros caminhos.
ALTER TABLE operations.organization_addresses
  ADD CONSTRAINT organization_addresses_origem_dominio
    CHECK (source IS NULL OR source IN
      ('MANUAL', 'FICHA_PDF', 'RECEITA_FEDERAL', 'SEFAZ', 'CEP', 'IMPORTACAO'));

INSERT INTO operations.audit_events (organization_id, action, entity_type, entity_id, metadata)
SELECT organization_id, 'CADASTRO_VALOR_FORA_DO_DOMINIO', 'organization_contacts', id,
       jsonb_build_object('coluna', 'type', 'valor_anterior', type, 'normalizado_para', 'OTHER')
  FROM operations.organization_contacts
 WHERE type IS NULL
    OR type NOT IN ('OWNER', 'BILLING', 'FINANCE', 'TECH', 'MARKETING', 'FISCAL', 'OTHER');

UPDATE operations.organization_contacts
   SET type = 'OTHER'
 WHERE type IS NULL
    OR type NOT IN ('OWNER', 'BILLING', 'FINANCE', 'TECH', 'MARKETING', 'FISCAL', 'OTHER');

ALTER TABLE operations.organization_contacts
  ADD CONSTRAINT organization_contacts_tipo_dominio
    CHECK (type IN ('OWNER', 'BILLING', 'FINANCE', 'TECH', 'MARKETING', 'FISCAL', 'OTHER'));

-- ---------------------------------------------------------------------------
-- 4. Um endereço principal por tipo, um contato principal por cliente
-- ---------------------------------------------------------------------------
-- Faturar num endereço e entregar em outro só funciona se houver um endereço
-- por papel. Hoje nada impede três "principais" do mesmo tipo, e a tela pega o
-- primeiro que vier — que muda entre consultas.
--
-- Antes do índice, resolve o que já está repetido: mantém como principal o mais
-- recente e rebaixa os outros, registrando a mudança.

INSERT INTO operations.audit_events (organization_id, action, entity_type, entity_id, metadata)
SELECT organization_id, 'CADASTRO_PRINCIPAL_DUPLICADO', 'organization_addresses', id,
       jsonb_build_object('coluna', 'is_primary', 'valor_anterior', true, 'normalizado_para', false)
  FROM (
    SELECT id, organization_id,
           row_number() OVER (PARTITION BY organization_id, type
                              ORDER BY updated_at DESC, created_at DESC, id DESC) AS posicao
      FROM operations.organization_addresses
     WHERE is_primary
  ) AS r
 WHERE posicao > 1;

UPDATE operations.organization_addresses a
   SET is_primary = false
  FROM (
    SELECT id,
           row_number() OVER (PARTITION BY organization_id, type
                              ORDER BY updated_at DESC, created_at DESC, id DESC) AS posicao
      FROM operations.organization_addresses
     WHERE is_primary
  ) AS r
 WHERE a.id = r.id AND r.posicao > 1;

CREATE UNIQUE INDEX organization_addresses_um_principal_por_tipo
    ON operations.organization_addresses (organization_id, type)
 WHERE is_primary;

INSERT INTO operations.audit_events (organization_id, action, entity_type, entity_id, metadata)
SELECT organization_id, 'CADASTRO_PRINCIPAL_DUPLICADO', 'organization_contacts', id,
       jsonb_build_object('coluna', 'is_primary', 'valor_anterior', true, 'normalizado_para', false)
  FROM (
    SELECT id, organization_id,
           row_number() OVER (PARTITION BY organization_id
                              ORDER BY updated_at DESC, created_at DESC, id DESC) AS posicao
      FROM operations.organization_contacts
     WHERE is_primary
  ) AS r
 WHERE posicao > 1;

UPDATE operations.organization_contacts c
   SET is_primary = false
  FROM (
    SELECT id,
           row_number() OVER (PARTITION BY organization_id
                              ORDER BY updated_at DESC, created_at DESC, id DESC) AS posicao
      FROM operations.organization_contacts
     WHERE is_primary
  ) AS r
 WHERE c.id = r.id AND r.posicao > 1;

CREATE UNIQUE INDEX organization_contacts_um_principal
    ON operations.organization_contacts (organization_id)
 WHERE is_primary;

-- ---------------------------------------------------------------------------
-- 5. O que falta no endereço para emitir nota
-- ---------------------------------------------------------------------------
-- A NFS-e identifica a cidade pelo código IBGE, não pelo nome: "Santa Maria"
-- existe em oito estados. E cliente fora do Brasil precisa do país em código,
-- não da palavra que alguém digitou.

ALTER TABLE operations.organization_addresses
  ADD COLUMN IF NOT EXISTS "municipio_ibge" TEXT,
  ADD COLUMN IF NOT EXISTS "pais_iso" TEXT;

COMMENT ON COLUMN operations.organization_addresses.municipio_ibge IS
  'Código IBGE do município, 7 dígitos. É como a NFS-e identifica a cidade.';
COMMENT ON COLUMN operations.organization_addresses.pais_iso IS
  'País em ISO 3166-1 alpha-2 (BR, PT, US). A coluna `country` continua sendo o nome exibido.';

ALTER TABLE operations.organization_addresses
  ADD CONSTRAINT organization_addresses_municipio_ibge_formato
    CHECK (municipio_ibge IS NULL OR municipio_ibge ~ '^[0-9]{7}$'),
  ADD CONSTRAINT organization_addresses_pais_iso_formato
    CHECK (pais_iso IS NULL OR pais_iso ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS organization_addresses_municipio_ibge_idx
    ON operations.organization_addresses (municipio_ibge)
 WHERE municipio_ibge IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. A ficha fiscal do cliente
-- ---------------------------------------------------------------------------
-- Espelha `identidade_da_casa`, que guarda os dados de quem emite. Esta tabela
-- guarda os de para quem se emite, e passa a ser a fonte canônica da inscrição
-- estadual, da inscrição municipal e do CPF do responsável — hoje espalhados
-- em `organization_profiles`, junto de dados de atendimento.
--
-- O que NÃO entra aqui, de propósito, para não existir em dois lugares:
--
-- - razão social: é `organizations.legal_name`;
-- - CNPJ/CPF: é `organizations.cpf_cnpj`;
-- - situação cadastral e data de abertura: vêm de `organizations.cnpj_data`,
--   que é a resposta da Receita, com origem e data;
-- - endereço: é `organization_addresses`, do tipo FISCAL quando o de cobrança
--   difere do principal.

CREATE TYPE operations.tipo_pessoa AS ENUM ('JURIDICA', 'FISICA', 'ESTRANGEIRA');

CREATE TYPE operations.regime_tributario AS ENUM (
  'SIMPLES_NACIONAL',
  'MEI',
  'LUCRO_PRESUMIDO',
  'LUCRO_REAL',
  'IMUNE',
  'ISENTO',
  'NAO_INFORMADO'
);

-- `indIEDest` da NF-e: 1 contribuinte, 2 isento, 9 não contribuinte. Guardar o
-- significado, não o número, para a tela não precisar de uma legenda.
CREATE TYPE operations.indicador_inscricao_estadual AS ENUM (
  'CONTRIBUINTE',
  'ISENTO',
  'NAO_CONTRIBUINTE'
);

CREATE TABLE operations.dados_fiscais_do_cliente (
  "id"                         TEXT NOT NULL,
  "organization_id"            TEXT NOT NULL,
  "tipo_pessoa"                operations.tipo_pessoa NOT NULL DEFAULT 'JURIDICA',
  "inscricao_estadual"         TEXT,
  "inscricao_municipal"        TEXT,
  "indicador_inscricao_estadual" operations.indicador_inscricao_estadual,
  "regime_tributario"          operations.regime_tributario NOT NULL DEFAULT 'NAO_INFORMADO',
  "cnae"                       TEXT,
  "inscricao_produtor_rural"   TEXT,
  "suframa"                    TEXT,
  "nif"                        TEXT,
  "cpf_responsavel"            TEXT,
  "codigo_servico"             TEXT,
  "iss_retido"                 BOOLEAN NOT NULL DEFAULT false,
  "retem_irrf"                 BOOLEAN NOT NULL DEFAULT false,
  "retem_inss"                 BOOLEAN NOT NULL DEFAULT false,
  "retem_pis_cofins_csll"      BOOLEAN NOT NULL DEFAULT false,
  "aliquota_iss_retido"        DECIMAL(5,2),
  "email_fiscal"               TEXT,
  "observacao_fiscal"          TEXT,
  "atualizado_por"             TEXT,
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dados_fiscais_do_cliente_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE operations.dados_fiscais_do_cliente IS
  'Dados tributários do cliente: o que a NFS-e e a NF-e exigem do destinatário.';
COMMENT ON COLUMN operations.dados_fiscais_do_cliente.cnae IS
  'CNAE principal, só dígitos (7). Vem da Receita quando há consulta de CNPJ.';
COMMENT ON COLUMN operations.dados_fiscais_do_cliente.nif IS
  'Número de identificação fiscal no exterior. Só faz sentido com tipo_pessoa ESTRANGEIRA.';
COMMENT ON COLUMN operations.dados_fiscais_do_cliente.cpf_responsavel IS
  'CPF de quem responde pela empresa. O gateway exige pessoa física no boleto e no cartão mesmo quando quem paga é CNPJ.';
COMMENT ON COLUMN operations.dados_fiscais_do_cliente.codigo_servico IS
  'Item da lista da LC 116/2003 usado nas notas deste cliente, quando difere do padrão da casa.';

CREATE UNIQUE INDEX "dados_fiscais_do_cliente_organization_id_key"
    ON operations.dados_fiscais_do_cliente ("organization_id");

ALTER TABLE operations.dados_fiscais_do_cliente
  ADD CONSTRAINT "dados_fiscais_do_cliente_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES operations.organizations("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE operations.dados_fiscais_do_cliente
  ADD CONSTRAINT dados_fiscais_cnae_formato
    CHECK (cnae IS NULL OR cnae ~ '^[0-9]{7}$'),
  ADD CONSTRAINT dados_fiscais_cpf_responsavel_valido
    CHECK (cpf_responsavel IS NULL OR operations.cpf_valido(cpf_responsavel)),
  ADD CONSTRAINT dados_fiscais_aliquota_iss_faixa
    CHECK (aliquota_iss_retido IS NULL OR (aliquota_iss_retido >= 0 AND aliquota_iss_retido <= 100)),
  -- ISS retido sem alíquota é nota que não fecha: a prefeitura precisa do
  -- percentual para calcular a retenção.
  ADD CONSTRAINT dados_fiscais_iss_retido_tem_aliquota
    CHECK (NOT iss_retido OR aliquota_iss_retido IS NOT NULL),
  -- Isento de inscrição estadual não tem número de inscrição estadual.
  ADD CONSTRAINT dados_fiscais_ie_coerente
    CHECK (indicador_inscricao_estadual IS DISTINCT FROM 'ISENTO' OR inscricao_estadual IS NULL),
  -- NIF é de quem está fora do Brasil.
  ADD CONSTRAINT dados_fiscais_nif_so_estrangeiro
    CHECK (nif IS NULL OR tipo_pessoa = 'ESTRANGEIRA');

-- O tipo de pessoa tem de concordar com o documento, e o documento mora em
-- outra tabela — o que um CHECK não alcança. Dois gatilhos cobrem os dois lados
-- da mesma regra: mudar a ficha fiscal e mudar o documento do cliente.
CREATE OR REPLACE FUNCTION operations.exige_documento_coerente(
  p_organization_id text,
  p_tipo_pessoa operations.tipo_pessoa
)
RETURNS void
LANGUAGE plpgsql
AS $funcao$
DECLARE
  documento text;
BEGIN
  SELECT cpf_cnpj INTO documento
    FROM operations.organizations
   WHERE id = p_organization_id;

  IF documento IS NULL THEN
    RETURN;
  END IF;

  IF p_tipo_pessoa = 'FISICA' AND length(documento) <> 11 THEN
    RAISE EXCEPTION
      'Cliente % é pessoa física e o documento cadastrado tem % caracteres: CPF tem 11.',
      p_organization_id, length(documento);
  END IF;

  IF p_tipo_pessoa = 'JURIDICA' AND length(documento) <> 14 THEN
    RAISE EXCEPTION
      'Cliente % é pessoa jurídica e o documento cadastrado tem % caracteres: CNPJ tem 14.',
      p_organization_id, length(documento);
  END IF;

  IF p_tipo_pessoa = 'ESTRANGEIRA' THEN
    RAISE EXCEPTION
      'Cliente % está marcado como estrangeiro e tem CPF/CNPJ cadastrado. Use o NIF.',
      p_organization_id;
  END IF;
END
$funcao$;

CREATE OR REPLACE FUNCTION operations.fiscal_valida_tipo_pessoa()
RETURNS trigger
LANGUAGE plpgsql
AS $funcao$
BEGIN
  PERFORM operations.exige_documento_coerente(NEW.organization_id, NEW.tipo_pessoa);
  RETURN NEW;
END
$funcao$;

CREATE TRIGGER dados_fiscais_tipo_pessoa
  BEFORE INSERT OR UPDATE OF tipo_pessoa, organization_id
  ON operations.dados_fiscais_do_cliente
  FOR EACH ROW EXECUTE FUNCTION operations.fiscal_valida_tipo_pessoa();

CREATE OR REPLACE FUNCTION operations.organizacao_valida_documento()
RETURNS trigger
LANGUAGE plpgsql
AS $funcao$
DECLARE
  tipo operations.tipo_pessoa;
BEGIN
  SELECT tipo_pessoa INTO tipo
    FROM operations.dados_fiscais_do_cliente
   WHERE organization_id = NEW.id;

  IF tipo IS NOT NULL THEN
    PERFORM operations.exige_documento_coerente(NEW.id, tipo);
  END IF;

  RETURN NEW;
END
$funcao$;

CREATE TRIGGER organizations_documento_coerente
  AFTER UPDATE OF cpf_cnpj ON operations.organizations
  FOR EACH ROW EXECUTE FUNCTION operations.organizacao_valida_documento();

-- ---------------------------------------------------------------------------
-- 7. Trazer o que já existe para o lugar certo
-- ---------------------------------------------------------------------------
-- Cria a ficha fiscal de quem já tem inscrição estadual, inscrição municipal ou
-- CPF de responsável no perfil. As colunas antigas continuam no lugar — nada é
-- apagado —, mas a fonte canônica passa a ser esta tabela.
--
-- `tipo_pessoa` vem do tamanho do documento, não de palpite: 11 é CPF, 14 é
-- CNPJ. Sem documento, o padrão JURIDICA se mantém, que é o caso de quase todo
-- cliente da casa.

INSERT INTO operations.dados_fiscais_do_cliente (
  id, organization_id, tipo_pessoa, inscricao_estadual, inscricao_municipal,
  cpf_responsavel, created_at, updated_at
)
SELECT
  'dfc_' || o.id,
  o.id,
  CASE
    WHEN length(o.cpf_cnpj) = 11 THEN 'FISICA'::operations.tipo_pessoa
    ELSE 'JURIDICA'::operations.tipo_pessoa
  END,
  nullif(btrim(p.state_registration), ''),
  nullif(btrim(p.municipal_registration), ''),
  CASE
    WHEN p.responsible_cpf IS NOT NULL AND operations.cpf_valido(p.responsible_cpf)
      THEN regexp_replace(p.responsible_cpf, '\D', '', 'g')
    ELSE NULL
  END,
  NOW(),
  NOW()
  FROM operations.organizations o
  JOIN operations.organization_profiles p ON p.organization_id = o.id
 WHERE nullif(btrim(p.state_registration), '') IS NOT NULL
    OR nullif(btrim(p.municipal_registration), '') IS NOT NULL
    OR nullif(btrim(p.responsible_cpf), '') IS NOT NULL;

-- CNAE da consulta de CNPJ já guardada, quando a resposta da Receita o trouxe.
-- Dado de órgão, não inferência.
UPDATE operations.dados_fiscais_do_cliente f
   SET cnae = regexp_replace(c.codigo, '\D', '', 'g')
  FROM (
    SELECT o.id AS organization_id,
           coalesce(
             o.cnpj_data #>> '{cnae_fiscal}',
             o.cnpj_data #>> '{atividade_principal,0,code}',
             o.cnpj_data #>> '{cnaePrincipal,codigo}'
           ) AS codigo
      FROM operations.organizations o
     WHERE o.cnpj_data IS NOT NULL
  ) AS c
 WHERE f.organization_id = c.organization_id
   AND f.cnae IS NULL
   AND c.codigo IS NOT NULL
   AND length(regexp_replace(c.codigo, '\D', '', 'g')) = 7;

-- ---------------------------------------------------------------------------
-- 8. Auditoria do cadastro
-- ---------------------------------------------------------------------------
-- `core.audit_change()` já existe e grava antes/depois em `core.audit_events`,
-- que é append-only. Conciliação e exportação geram evento de auditoria; o
-- cadastro, que é a origem de tudo, não gerava.

CREATE TRIGGER dados_fiscais_auditoria
  AFTER INSERT OR UPDATE OR DELETE ON operations.dados_fiscais_do_cliente
  FOR EACH ROW EXECUTE FUNCTION core.audit_change();

CREATE TRIGGER organization_addresses_auditoria
  AFTER INSERT OR UPDATE OR DELETE ON operations.organization_addresses
  FOR EACH ROW EXECUTE FUNCTION core.audit_change();

CREATE TRIGGER organization_contacts_auditoria
  AFTER INSERT OR UPDATE OR DELETE ON operations.organization_contacts
  FOR EACH ROW EXECUTE FUNCTION core.audit_change();

-- ---------------------------------------------------------------------------
-- 9. O que o cadastro responde
-- ---------------------------------------------------------------------------

-- Ficha fiscal completa do cliente, já com o endereço certo escolhido: FISCAL
-- quando existe, senão COBRANCA, senão o principal. É o que a emissão de nota
-- precisa ler, numa consulta só.
CREATE VIEW operations.cliente_ficha_fiscal AS
SELECT
  o.id                              AS organization_id,
  o.client_number,
  o.name                            AS nome_fantasia,
  o.legal_name                      AS razao_social,
  o.cpf_cnpj                         AS documento,
  CASE
    WHEN o.cpf_cnpj IS NULL THEN NULL
    WHEN length(o.cpf_cnpj) = 11 THEN 'CPF'
    ELSE 'CNPJ'
  END                               AS documento_tipo,
  operations.documento_valido(o.cpf_cnpj) AS documento_valido,
  o.status,
  coalesce(f.tipo_pessoa, 'JURIDICA'::operations.tipo_pessoa) AS tipo_pessoa,
  coalesce(f.regime_tributario, 'NAO_INFORMADO'::operations.regime_tributario) AS regime_tributario,
  f.indicador_inscricao_estadual,
  f.inscricao_estadual,
  f.inscricao_municipal,
  f.cnae,
  f.suframa,
  f.inscricao_produtor_rural,
  f.nif,
  f.cpf_responsavel,
  f.codigo_servico,
  f.iss_retido,
  f.aliquota_iss_retido,
  f.retem_irrf,
  f.retem_inss,
  f.retem_pis_cofins_csll,
  coalesce(f.email_fiscal, p.email)  AS email_fiscal,
  e.type                            AS endereco_tipo,
  e.postal_code                     AS cep,
  e.street                          AS logradouro,
  e.number                          AS numero,
  e.complement                      AS complemento,
  e.district                        AS bairro,
  e.city                            AS municipio,
  e.municipio_ibge,
  e.state                           AS uf,
  coalesce(e.pais_iso, CASE WHEN e.country = 'Brasil' THEN 'BR' END) AS pais_iso
  FROM operations.organizations o
  LEFT JOIN operations.dados_fiscais_do_cliente f ON f.organization_id = o.id
  LEFT JOIN operations.organization_profiles p ON p.organization_id = o.id
  LEFT JOIN LATERAL (
    SELECT a.*
      FROM operations.organization_addresses a
     WHERE a.organization_id = o.id
     ORDER BY CASE a.type WHEN 'FISCAL' THEN 1 WHEN 'BILLING' THEN 2 WHEN 'MAIN' THEN 3 ELSE 4 END,
              a.is_primary DESC,
              a.updated_at DESC
     LIMIT 1
  ) AS e ON true;

COMMENT ON VIEW operations.cliente_ficha_fiscal IS
  'Destinatário da nota numa linha: documento, tributação e o endereço de maior precedência fiscal.';

-- O que falta, por cliente, para emitir nota e para cobrar. Cada pendência tem
-- um código estável, para a tela mostrar a lista e o motivo sem recalcular a
-- regra em TypeScript.
CREATE VIEW operations.cadastro_pendencias AS
WITH base AS (SELECT * FROM operations.cliente_ficha_fiscal)
SELECT organization_id, client_number, nome_fantasia, codigo, impede, descricao
  FROM base
 CROSS JOIN LATERAL (
   VALUES
     ('DOCUMENTO_AUSENTE',  'EMITIR_NOTA', 'Sem CPF/CNPJ cadastrado',
      base.documento IS NULL),
     ('DOCUMENTO_INVALIDO', 'EMITIR_NOTA', 'CPF/CNPJ com dígito verificador errado',
      base.documento IS NOT NULL AND NOT base.documento_valido),
     ('RAZAO_SOCIAL_AUSENTE', 'EMITIR_NOTA', 'Sem razão social',
      base.razao_social IS NULL OR btrim(base.razao_social) = ''),
     ('ENDERECO_AUSENTE', 'EMITIR_NOTA', 'Sem endereço cadastrado',
      base.endereco_tipo IS NULL),
     ('MUNICIPIO_IBGE_AUSENTE', 'EMITIR_NOTA', 'Endereço sem código IBGE do município',
      base.endereco_tipo IS NOT NULL AND base.municipio_ibge IS NULL),
     ('CEP_AUSENTE', 'EMITIR_NOTA', 'Endereço sem CEP',
      base.endereco_tipo IS NOT NULL AND (base.cep IS NULL OR btrim(base.cep) = '')),
     ('REGIME_NAO_INFORMADO', 'EMITIR_NOTA', 'Regime tributário não informado',
      base.regime_tributario = 'NAO_INFORMADO'),
     ('INDICADOR_IE_AUSENTE', 'EMITIR_NOTA', 'Sem indicador de inscrição estadual do destinatário',
      base.indicador_inscricao_estadual IS NULL),
     ('EMAIL_FISCAL_AUSENTE', 'ENVIAR_NOTA', 'Sem e-mail para enviar a nota',
      base.email_fiscal IS NULL OR btrim(base.email_fiscal) = ''),
     ('CPF_RESPONSAVEL_AUSENTE', 'COBRAR', 'Sem CPF do responsável: boleto e cartão ficam indisponíveis',
      base.cpf_responsavel IS NULL)
 ) AS pendencia(codigo, impede, descricao, presente)
 WHERE pendencia.presente;

COMMENT ON VIEW operations.cadastro_pendencias IS
  'Uma linha por lacuna de cadastro, com o código da pendência e o que ela impede.';

-- Quantas pendências cada cliente tem, por consequência. É o número que a lista
-- de clientes mostra sem varrer a view de pendências para cada linha.
CREATE VIEW operations.cadastro_completude AS
SELECT
  o.id   AS organization_id,
  o.client_number,
  o.name AS nome_fantasia,
  o.status,
  count(p.codigo) FILTER (WHERE p.impede = 'EMITIR_NOTA') AS pendencias_para_emitir_nota,
  count(p.codigo) FILTER (WHERE p.impede = 'ENVIAR_NOTA') AS pendencias_para_enviar_nota,
  count(p.codigo) FILTER (WHERE p.impede = 'COBRAR')      AS pendencias_para_cobrar,
  count(p.codigo)                                          AS pendencias_total,
  count(p.codigo) FILTER (WHERE p.impede = 'EMITIR_NOTA') = 0 AS pode_emitir_nota
  FROM operations.organizations o
  LEFT JOIN operations.cadastro_pendencias p ON p.organization_id = o.id
 GROUP BY o.id, o.client_number, o.name, o.status;

COMMENT ON VIEW operations.cadastro_completude IS
  'Cobertura do cadastro por cliente: quantas pendências e se já dá para emitir nota.';

-- ---------------------------------------------------------------------------
-- 10. Permissões
-- ---------------------------------------------------------------------------
-- Sem `ALTER TABLE ... OWNER TO app_avila`, de propósito, e isso não é
-- esquecimento.
--
-- Em produção as migrações rodam como `app_avila`, então a tabela já nasce dele
-- — o ALTER seria redundante. No CI o papel existe vazio, sem privilégio
-- nenhum, e as outras tabelas pertencem ao `postgres`. Trocar o dono só desta
-- quebra a uniformidade: a exclusão em cascata a partir de `organizations`
-- passa a rodar com os direitos do dono da tabela referenciante, e o gatilho de
-- auditoria tenta escrever em `core.audit_events` como `app_avila`, que no CI
-- não tem USAGE no schema `core`. O resultado é a suíte inteira reprovando por
-- "permission denied for schema core" — erro que não aparece em produção e que
-- não diz o que fazer.
DO $bloco$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON operations.dados_fiscais_do_cliente TO app_avila;
    GRANT SELECT ON operations.cliente_ficha_fiscal TO app_avila;
    GRANT SELECT ON operations.cadastro_pendencias TO app_avila;
    GRANT SELECT ON operations.cadastro_completude TO app_avila;

    GRANT EXECUTE ON FUNCTION operations.documento_normalizado(text) TO app_avila;
    GRANT EXECUTE ON FUNCTION operations.cpf_valido(text) TO app_avila;
    GRANT EXECUTE ON FUNCTION operations.cnpj_valido(text) TO app_avila;
    GRANT EXECUTE ON FUNCTION operations.documento_valido(text) TO app_avila;
  END IF;
END
$bloco$;
