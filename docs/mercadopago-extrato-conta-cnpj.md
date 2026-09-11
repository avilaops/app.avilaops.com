# Extrato do Mercado Pago: a conta do CNPJ entra pelo n8n (11/09/2026)

## O problema

O extrato do Mercado Pago no `/financeiro` estava vazio. O token de produção
no `.env` do app pertence à conta `nicolas@avila.inc` (id 2944732714, criada em
24/10/2025), cuja história inteira é uma compra de fone de R$ 24,90. O
histórico de pagamentos e recebimentos da casa está em **outro login**: a conta
do **CNPJ 67.954.417**, e-mail `nicolas@avilaops.com`. Há ainda um terceiro
login, o pessoal `nicolasrosaab@gmail.com`.

A conta do token continua sendo a que cobra as lojas. Não se troca.

## A decisão

O Nicolas pediu a credencial da conta do CNPJ **direto no n8n**. O token dessa
conta não vai para o `.env` do app: fica no cofre do n8n, e o n8n é quem lê a
API do Mercado Pago e entrega ao app.

## Como funciona

1. Credencial n8n `Mercado Pago - Conta CNPJ 67.954.417 (historico)`
   (`bNeXor6Ok54jjpbO`, Bearer). Nasceu com um valor de exemplo; o Nicolas cola
   o Access Token de produção (`APP_USR-...`) gerado no painel de desenvolvedor
   daquela conta.
2. Workflow `Ávila OS — Mercado Pago · Extrato da conta CNPJ`
   (`NV72KXfoSZceQtlP`): todo dia às 06:30 lê `/users/me` e
   `/v1/payments/search` dos últimos 7 dias, paginando de 50 em 50, e manda o
   JSON cru para o app. Para a carga inicial:

   ```
   POST https://n8n.avilaops.com/webhook/avila-os-mp-extrato
   x-avila-webhook-token: <N8N_AVILA_OS_TOKEN>
   { "days": 365 }
   ```

3. `POST /api/integrations/mercadopago/importar` (sessão do dono ou
   `x-service-key`) recebe `{ conta: { id, nome, usuarioId, apelido }, days,
   pagamentos: [...] }`, normaliza cada pagamento com `normalizarPagamento` e
   grava com `gravarPagamentosMercadoPago` na conta `mercadopago-cnpj` de
   `bank_accounts`. O `usuarioId` é obrigatório: é ele que diz se a conta
   recebeu (venda, EMPRESA) ou pagou (compra, fila de triagem).
4. A regra de leitura mora num lugar só, `src/lib/sync-mercadopago.ts`. O
   `runMercadoPagoSync` da conta do token virou "buscar + gravar" com a mesma
   função de gravação.

## Limite que continua

`/v1/payments/search` traz pagamentos: o que entrou por cobrança e o que a
conta pagou em compras. **Pix enviado e recebido pelo saldo não sai por API.**
Para o extrato completo, exportar o CSV de "Atividade" no app do Mercado Pago e
importar como o da Wise (importador ainda não existe; precisa de um arquivo de
exemplo).

## Consertado no caminho

Só 3 credenciais tinham sobrevivido à restauração do n8n de 08/09. A `Ávila
OS Service Key` foi recriada (`PJw9cbn9PrNNKBs4`) e religada nos quatro fluxos
que apontavam para a antiga: Sincronizar Éfi, Rodada Diária, Google do cliente
e Avisar buscadores. Sem isso o Éfi não sincronizava desde 08/09.
