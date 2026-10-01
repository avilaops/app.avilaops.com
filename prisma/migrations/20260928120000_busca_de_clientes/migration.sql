-- Busca na lista de clientes.
--
-- A tela carregava todas as organizações e desenhava todas numa página só.
-- Com 24 clientes passa; com 10 mil a página vira um download de megabytes e
-- não há como achar ninguém. A busca passa a acontecer no banco, paginada, e
-- estes índices são o que a deixa rápida em qualquer tamanho de carteira.
--
-- Sem a extensão `unaccent`: ela não é IMMUTABLE e por isso não entra em
-- índice sem um invólucro que mente sobre isso. `translate` é imutável de
-- verdade e cobre os acentos do português, que é o que se digita aqui.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION operations.texto_busca(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower(coalesce(valor, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn'
  )
$$;

-- Nome fantasia, razão social, segmento e slug num texto só: a pessoa digita
-- "padaria" sem saber em qual dos quatro campos a palavra está.
CREATE INDEX IF NOT EXISTS "organizations_busca_trgm_idx"
  ON "operations"."organizations"
  USING GIN (
    operations.texto_busca(
      "name" || ' ' || coalesce("legal_name", '') || ' ' || coalesce("segment", '') || ' ' || "slug"
    ) gin_trgm_ops
  );

-- CNPJ digitado pela metade ("33000167") também acha.
CREATE INDEX IF NOT EXISTS "organizations_cpf_cnpj_trgm_idx"
  ON "operations"."organizations"
  USING GIN ("cpf_cnpj" gin_trgm_ops);

-- Quem liga é a pessoa, não a empresa: buscar pelo nome, e-mail ou telefone
-- do contato é o caso mais comum no atendimento.
CREATE INDEX IF NOT EXISTS "organization_contacts_busca_trgm_idx"
  ON "operations"."organization_contacts"
  USING GIN (
    operations.texto_busca("name" || ' ' || coalesce("email", '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS "organization_contacts_telefone_trgm_idx"
  ON "operations"."organization_contacts"
  USING GIN (
    regexp_replace(coalesce("phone", '') || ' ' || coalesce("whatsapp", ''), '\D', '', 'g') gin_trgm_ops
  );

-- Ordenação padrão da lista (status e nome) sem ordenar a tabela inteira.
CREATE INDEX IF NOT EXISTS "organizations_status_name_idx"
  ON "operations"."organizations" ("status", "name");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT EXECUTE ON FUNCTION operations.texto_busca(text) TO app_avila;
  END IF;
END $$;
