-- Peça do Estúdio passa a ter dono. Nulo = peça da casa (MARCA_PADRAO), que é
-- o que todas as peças existentes são. Aditiva: nenhuma linha muda de valor.
ALTER TABLE "operations"."studio_pieces" ADD COLUMN "organization_id" TEXT;

-- Cliente apagado não leva a peça junto: o histórico do que foi produzido
-- continua, órfão, como peça da casa.
ALTER TABLE "operations"."studio_pieces"
    ADD CONSTRAINT "studio_pieces_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "operations"."organizations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "studio_pieces_organization_id_updated_at_idx"
    ON "operations"."studio_pieces"("organization_id", "updated_at");
