-- Proveniência da tela Saúde em tempo real. Só colunas novas e anuláveis
-- (ou com default): leituras antigas continuam válidas e o coletor v1 segue
-- sendo aceito enquanto os hosts não recebem o v2.
ALTER TABLE "operations"."service_health_checks"
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "trigger" TEXT,
  ADD COLUMN "probe_server" TEXT,
  ADD COLUMN "probe_version" TEXT,
  ADD COLUMN "method" TEXT,
  ADD COLUMN "final_url" TEXT,
  ADD COLUMN "redirects" INTEGER,
  ADD COLUMN "resolved_ip" TEXT,
  ADD COLUMN "dns_ms" INTEGER,
  ADD COLUMN "connect_ms" INTEGER,
  ADD COLUMN "tls_ms" INTEGER,
  ADD COLUMN "ttfb_ms" INTEGER,
  ADD COLUMN "error_category" TEXT,
  ADD COLUMN "error_message" TEXT,
  ADD COLUMN "finished_at" TIMESTAMP(3),
  ADD COLUMN "persisted_at" TIMESTAMP(3);

ALTER TABLE "operations"."server_health_snapshots"
  ADD COLUMN "observed_at" TIMESTAMP(3),
  ADD COLUMN "persisted_at" TIMESTAMP(3),
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "collector_version" TEXT,
  ADD COLUMN "hostname" TEXT,
  ADD COLUMN "source_ip" TEXT,
  ADD COLUMN "containers_total" INTEGER,
  ADD COLUMN "containers_stopped" INTEGER,
  ADD COLUMN "raw" JSONB;

-- Default só depois de criar: as linhas antigas ficam com NULL ("não sabemos
-- quando foram gravadas") em vez de receber a hora desta migração, que seria
-- um horário inventado.
ALTER TABLE "operations"."service_health_checks" ALTER COLUMN "persisted_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "operations"."server_health_snapshots" ALTER COLUMN "persisted_at" SET DEFAULT CURRENT_TIMESTAMP;
