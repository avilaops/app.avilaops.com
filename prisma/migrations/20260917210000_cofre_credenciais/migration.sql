-- Cofre de credenciais da plataforma. Ver docs/inventario-chaves-integracoes.md.
CREATE TABLE "operations"."platform_credentials" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "rotulo" TEXT,
    "descricao" TEXT,
    "segredo" BOOLEAN NOT NULL DEFAULT true,
    "valor_cipher" TEXT,
    "mascara" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "consumidores" JSONB,
    "origem" TEXT,
    "atualizado_por" TEXT,
    "rotacionado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_credentials_chave_key" ON "operations"."platform_credentials"("chave");
CREATE INDEX "platform_credentials_categoria_status_idx" ON "operations"."platform_credentials"("categoria", "status");
