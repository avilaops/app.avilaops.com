# A mensalidade passa a ser cobrada no Mercado Pago (30/08/2026)

> Decisão do Nicolas: "esquece do banco Éfi por enquanto, só pelo Mercado
> Pago". Isto encerra a pergunta que estava aberta no
> `provisionamento-n8n.md` §5b, onde a assinatura cobrava pela Éfi e as lojas
> pelo Mercado Pago.

## 1. O que mudou

`src/lib/assinaturas.ts` passou a importar `mercadopago-cobranca.ts` no lugar
de `efi-cobranca.ts`. Foi a troca de uma linha de import porque o módulo novo
tem **a mesma interface de propósito**: `createPixCharge`,
`createBoletoCharge`, `createCardCharge`, com os mesmos campos de entrada e de
saída. Quem já sabia ler o fluxo antigo lê o novo sem aprender nada.

O modelo de dados não mudou. Nenhuma migração de banco. `SubscriptionCharge`
continua guardando `externalId`, `pixCopyPaste`, `pixQrBase64`, `boletoUrl`,
`boletoBarcode`, `installments` e `interestAmount` exatamente como antes, e as
telas do produto não souberam da troca.

## 2. O que a Éfi continua fazendo

- **As cobranças que já estão abertas nela.** Elas ainda vão ser pagas, e
  `/api/webhooks/efi` segue no ar para dar baixa. `baixarCobrancaPorIdExterno`
  aceita os nomes de "pagou" dos dois gateways ao mesmo tempo. Essa lista só
  encolhe quando a última cobrança da Éfi fechar.
- **Os entregáveis** (`DeliverableCharge`, o serviço avulso). Não foram
  migrados: é outro fluxo, com outra tela, e misturar as duas migrações
  dobrava o risco sem dobrar o ganho. Ficam para uma próxima.

Não há coluna de gateway em `SubscriptionCharge`, e a baixa procura por
`externalId`. Não há colisão possível porque o id do Mercado Pago é numérico e
o da Éfi não — mas é isto, e não um campo, que separa os dois mundos hoje. Se
um dia um terceiro gateway entrar, a coluna passa a ser necessária.

## 3. As três diferenças reais entre os gateways

| | Éfi | Mercado Pago |
|---|---|---|
| Pagador | CNPJ **ao lado** do CPF do titular | Documento é um par (tipo, número): **ou** CNPJ **ou** CPF |
| Boleto | CPF + e-mail | CPF/CNPJ + e-mail **+ endereço completo** |
| "Pagou" | `paid`, `CONFIRMED`, `settled` | `approved` |

O endereço é a única exigência que a migração acrescentou ao cliente. Sem ele
a API devolve 400 sem dizer qual campo faltou, então a recusa é nossa, em
`faltaParaCobrar`, com a frase que o cliente entende. **PIX e cartão não pedem
endereço** — só o boleto perde a disponibilidade.

O resumo entregue ao produto (`bloqueioPagamento`) usa o boleto como
referência por ser o mais exigente dos três: se ele passa, os outros passam.

## 4. Idempotência

`POST /v1/payments` vai com `X-Idempotency-Key` no formato
`{faturaId}:{método}:{minuto}`.

O minuto entra de propósito. Amarrar só à fatura impediria o cliente de gerar
um PIX novo depois de o primeiro vencer, porque o Mercado Pago devolveria a
cobrança antiga, já expirada. Não amarrar a nada devolveria cobrança dupla
quando a rede cai depois do POST e o app tenta de novo. O minuto é a janela em
que "de novo" é retry, e não segunda tentativa do cliente.

## 5. Webhook

`POST /api/webhooks/mercadopago`, com a mesma regra do da Éfi: **o corpo do
POST é aviso, não prova**. A notificação diz só o id do pagamento; quem
responde se entrou dinheiro é `GET /v1/payments/{id}`. Um POST forjado, no
pior caso, faz uma consulta a mais.

Aceita os três formatos em que o Mercado Pago manda o id (`data.id` do webhook
novo, `?topic=payment&id=` do IPN antigo, e `resource` com a URL inteira), e
ignora com 200 o que não é pagamento — devolver 4xx faria a fila dele repetir
para sempre um evento que nunca vai ser nosso.

Status diferentes de `approved` também são gravados: o cliente precisa ver na
tela que o cartão foi recusado, senão fica esperando um "pendente" que nunca
vira pago.

## 6. O que falta configurar

1. **Apontar o webhook no painel do Mercado Pago** para
   `https://app.avilaops.com/api/webhooks/mercadopago`, tópico `payment`. Hoje
   a notificação de assinatura aponta para um host que não existe mais.
2. **`MP_WEBHOOK_TOKEN`** (opcional) no `.env.production`, e o mesmo valor como
   `?token=` na URL do webhook. Vazio aceita sem token, que é o comportamento
   de hoje; a confirmação pela API é o que de fato protege o dinheiro.
3. **O formulário de cartão** precisa mandar `paymentMethodId` e `issuerId`
   junto do token (o SDK do Mercado Pago devolve os três). Sem eles, cartão de
   bandeira menos comum é recusado com "payment_method_id inválido". A rota já
   aceita os dois campos.

`lib/parcelamento.ts` não mudou: o juros do parcelamento continua sendo conta
nossa, não do gateway, para o cliente ver o mesmo número na simulação e na
fatura do cartão.

## 7. Verificado em 30/08/2026

- `tsc --noEmit` e `eslint` limpos; `next build` completo.
- 49 testes unitários passando.
- Os testes de integração de cobrança (`tests/integration/assinaturas.test.ts`)
  foram **atualizados** para o contrato novo (a recusa por documento mudou de
  frase, e entraram dois casos para o endereço), mas **não foram executados**:
  o Postgres desta máquina está sem as migrações aplicadas
  (`operations.subscriptions` não existe). Rodar antes de confiar neles.
- Nenhuma cobrança real foi emitida.
