-- Endereço pessoal de quem usa a conta, fora dos domínios que a casa hospeda.
--
-- Sem ele a recuperação de senha é circular: quem perde a senha do e-mail
-- profissional recebe o link de volta na mesma caixa que não consegue abrir.
-- Em 02/09/2026 as três contas ativas estavam nessa situação, a do dono
-- inclusive.
--
-- Nulo por enquanto: as contas que já existem preenchem no primeiro acesso.
-- Conta nova passa a exigir na criação.
ALTER TABLE "public"."portal_clients"
  ADD COLUMN IF NOT EXISTS "email_recuperacao" TEXT;

-- A solicitação de cadastro coleta o mesmo endereço, e ele vira o
-- email_recuperacao da conta quando o pedido é aprovado.
ALTER TABLE "operations"."client_registration_requests"
  ADD COLUMN IF NOT EXISTS "email_recuperacao" TEXT;
