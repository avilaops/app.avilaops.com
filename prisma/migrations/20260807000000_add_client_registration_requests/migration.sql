-- CreateTable
CREATE TABLE "operations"."client_registration_requests" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "cpf_cnpj" TEXT NOT NULL,
    "tipo_documento" TEXT NOT NULL,
    "empresa" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "documentos" JSONB NOT NULL DEFAULT '[]',
    "motivo_rejeicao" TEXT,
    "revisado_por_id" TEXT,
    "revisado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_registration_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_registration_requests_status_criado_em_idx" ON "operations"."client_registration_requests"("status", "criado_em");
