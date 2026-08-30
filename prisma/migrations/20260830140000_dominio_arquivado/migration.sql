-- Arquivar domínio nunca funcionou em produção: a tela e a rota existem desde
-- 30/08/2026 (commit b08c757), mas o CHECK criado no init só aceitava PENDING,
-- ACTIVE, RENEWAL_DUE, EXPIRED e TRANSFERRED_OUT. Toda tentativa de arquivar
-- morria com 23514, ou seja, erro 500 na cara de quem clicou.
--
-- Recriar o CHECK é a correção mínima: o status é texto no Prisma, então não há
-- enum a alterar, e a lista continua fechada para valor inventado não entrar.
ALTER TABLE operations.domains DROP CONSTRAINT IF EXISTS domains_status_check;

ALTER TABLE operations.domains
  ADD CONSTRAINT domains_status_check
  CHECK (status = ANY (ARRAY[
    'PENDING', 'ACTIVE', 'RENEWAL_DUE', 'EXPIRED', 'TRANSFERRED_OUT', 'ARCHIVED'
  ]));
