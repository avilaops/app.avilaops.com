-- Catalogar somente metadados: o dono preenche os valores pela interface privada.
-- Não substituir credenciais já cadastradas nem armazenar segredos em migrations.
INSERT INTO operations.platform_credentials
  (id, chave, categoria, rotulo, descricao, segredo, status, consumidores, updated_at)
VALUES
  ('threads-app-id', 'THREADS_APP_ID', 'threads', 'ID do app Threads',
   'ID próprio do Threads nas configurações básicas do aplicativo Meta.', false,
   'PENDENTE', '["src/lib/threads.ts"]'::jsonb, CURRENT_TIMESTAMP),
  ('threads-app-secret', 'THREADS_APP_SECRET', 'threads', 'Chave secreta do app Threads',
   'Chave própria do Threads. Preencher somente no cofre privado.', true,
   'PENDENTE', '["src/lib/threads.ts"]'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT (chave) DO NOTHING;
