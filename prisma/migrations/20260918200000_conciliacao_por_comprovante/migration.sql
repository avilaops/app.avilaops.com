-- Procedência da contraparte de uma movimentação bancária.
--
-- Pix recebido fora de cobrança chega do Éfi sem pagador: a resposta de
-- `/v2/pix` traz valor, chave e `end_to_end_id`, e nada mais. A linha nasce
-- com `counterparty_name` nulo e não existe chamada que preencha isso depois.
-- Quem sabe o nome é o pagador, que manda o comprovante — e o comprovante
-- ainda traz o CPF/CNPJ, que o extrato nunca traz.
--
-- `counterparty_source` é o irmão de `scope_source`: diz quem decidiu o nome.
-- Nulo (ou 'EFI'/'IMPORTACAO') é o que veio do extrato; 'COMPROVANTE' é
-- identificação humana conferida contra o identificador ponta a ponta. A
-- distinção não é enfeite: a sincronização reescreve `counterparty_name` a
-- cada passada, e sem esta coluna a próxima passada apagaria o nome
-- identificado, devolvendo a linha para "Não informado".
--
-- Aditivo e idempotente.

ALTER TABLE "finance"."bank_transactions"
  ADD COLUMN IF NOT EXISTS "counterparty_document" TEXT,
  ADD COLUMN IF NOT EXISTS "counterparty_source" TEXT;
