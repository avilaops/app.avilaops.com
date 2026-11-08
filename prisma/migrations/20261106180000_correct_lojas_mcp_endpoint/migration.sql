-- Alinhar catálogo à rota MCP canônica publicada pelo Lojas.
-- Somente metadados. Não habilita publicação nem muda credenciais.
UPDATE "operations"."mcp_publications"
SET "endpoint" = 'https://lojas.avilaops.com/api/mcp',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'lojas'
  AND "endpoint" = 'https://lojas.avilaops.com/mcp'
  AND "enabled" = FALSE;
