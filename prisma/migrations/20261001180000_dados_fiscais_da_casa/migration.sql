-- Dados cadastrais e fiscais da casa, o certificado A1 dela e o agrupamento das
-- chaves de banco cadastradas à mão.
--
-- Aditiva: só colunas novas, todas anuláveis. Nada é alterado nem removido.
ALTER TABLE "operations"."identidade_da_casa"
    ADD COLUMN IF NOT EXISTS "razao_social" TEXT,
    ADD COLUMN IF NOT EXISTS "cnpj" TEXT,
    ADD COLUMN IF NOT EXISTS "inscricao_municipal" TEXT,
    ADD COLUMN IF NOT EXISTS "inscricao_estadual" TEXT,
    ADD COLUMN IF NOT EXISTS "regime_tributario" TEXT,
    ADD COLUMN IF NOT EXISTS "cnae" TEXT,
    ADD COLUMN IF NOT EXISTS "codigo_servico" TEXT,
    ADD COLUMN IF NOT EXISTS "codigo_tributacao_municipal" TEXT,
    ADD COLUMN IF NOT EXISTS "aliquota_iss" DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS "email_fiscal" TEXT,
    ADD COLUMN IF NOT EXISTS "telefone" TEXT,
    ADD COLUMN IF NOT EXISTS "site" TEXT,
    ADD COLUMN IF NOT EXISTS "cep" TEXT,
    ADD COLUMN IF NOT EXISTS "logradouro" TEXT,
    ADD COLUMN IF NOT EXISTS "numero" TEXT,
    ADD COLUMN IF NOT EXISTS "complemento" TEXT,
    ADD COLUMN IF NOT EXISTS "bairro" TEXT,
    ADD COLUMN IF NOT EXISTS "municipio" TEXT,
    ADD COLUMN IF NOT EXISTS "uf" TEXT,
    ADD COLUMN IF NOT EXISTS "codigo_municipio_ibge" TEXT,
    ADD COLUMN IF NOT EXISTS "certificado_cipher" TEXT,
    ADD COLUMN IF NOT EXISTS "certificado_info" JSONB;

ALTER TABLE "operations"."platform_credentials"
    ADD COLUMN IF NOT EXISTS "grupo" TEXT;
