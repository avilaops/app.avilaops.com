CREATE TABLE "operations"."service_health_checks" (
    "id" BIGSERIAL NOT NULL,
    "service_key" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "server_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_code" INTEGER,
    "latency_ms" INTEGER,
    "error_code" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_health_checks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_health_checks_service_key_checked_at_idx" ON "operations"."service_health_checks"("service_key", "checked_at");
CREATE INDEX "service_health_checks_status_checked_at_idx" ON "operations"."service_health_checks"("status", "checked_at");

CREATE TABLE "operations"."server_health_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "server_key" TEXT NOT NULL,
    "server_name" TEXT NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "memory_used_percent" DOUBLE PRECISION NOT NULL,
    "memory_available_mb" INTEGER NOT NULL,
    "swap_used_percent" DOUBLE PRECISION NOT NULL,
    "disk_used_percent" DOUBLE PRECISION NOT NULL,
    "load_1" DOUBLE PRECISION NOT NULL,
    "containers_running" INTEGER NOT NULL,
    "containers_unhealthy" INTEGER NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_health_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "server_health_snapshots_server_key_collected_at_idx" ON "operations"."server_health_snapshots"("server_key", "collected_at");
