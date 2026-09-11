-- Leituras de score de crédito (CPF do Nicolas e CNPJ da Ávila).
--
-- Nenhum birô abre API de score para pessoa física, e o da empresa é contrato
-- B2B. O que dá para fazer é guardar cada leitura (Serasa, Boa Vista, Quod,
-- SPC ou o que o app do banco mostra) com data, e olhar a série. O documento
-- em si não é gravado: só de quem é a leitura.
--
-- Aditivo e idempotente, como manda docs/plataforma/BANCO-COMPARTILHADO.md:
-- aplicado à mão com `--single-transaction -v ON_ERROR_STOP=1`.

CREATE TABLE IF NOT EXISTS finance.credit_score_readings (
    id BIGSERIAL PRIMARY KEY,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('CPF', 'CNPJ')),
    bureau TEXT NOT NULL CHECK (bureau IN ('SERASA', 'BOA_VISTA', 'QUOD', 'SPC', 'BANCO')),
    score INTEGER NOT NULL CHECK (score >= 0),
    max_score INTEGER NOT NULL DEFAULT 1000 CHECK (max_score > 0),
    read_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    note TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT credit_score_readings_score_within_scale CHECK (score <= max_score)
);

CREATE INDEX IF NOT EXISTS credit_score_readings_subject_bureau_read_at_idx
    ON finance.credit_score_readings (subject_kind, bureau, read_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_avila') THEN
    GRANT USAGE ON SCHEMA finance TO app_avila;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE finance.credit_score_readings TO app_avila;
    GRANT USAGE, SELECT ON SEQUENCE finance.credit_score_readings_id_seq TO app_avila;
  END IF;
END $$;
