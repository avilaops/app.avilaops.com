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
- ~~Os entregáveis~~ — **migrados em 31/08/2026**. Ver §8.

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
3. **O cartão é um caminho morto, e já era antes desta migração.**
   `criarCobrancaDaFatura` aceita `CARD`, a rota de billing aceita, e
   `mercadopago-cobranca.ts` sabe cobrar — mas **nenhuma tela oferece cartão**.
   A única que cobra hoje é `/admin/plano` do Comandeiro, e ela só mostra PIX e
   boleto; `server/billing/client.ts` nem manda `paymentToken`. Quando o
   formulário existir, ele precisa mandar `paymentMethodId` e `issuerId` junto
   do token (o SDK do Mercado Pago devolve os três), senão cartão de bandeira
   menos comum é recusado com "payment_method_id inválido". A rota já aceita os
   dois campos.

`lib/parcelamento.ts` não mudou: o juros do parcelamento continua sendo conta
nossa, não do gateway, para o cliente ver o mesmo número na simulação e na
fatura do cartão.

## 7b. Entregáveis, migrados em 31/08/2026

O serviço avulso (`DeliverableCharge`) era o último fluxo na Efí. Migrou com
uma diferença que a mensalidade não tem: **quem paga não é cliente cadastrado**.
É alguém que recebeu um link com token, e tudo o que se sabe dele é o que o
entregável guardou (`recipientName`, `recipientEmail`) mais o que ele digitar.

Por isso o pagador é montado em camadas, do mais específico para o mais
genérico: o que veio no formulário ganha do que está no entregável, que ganha
do cadastro da empresa emissora. Sem isso o PIX passaria a pedir um e-mail que
a tela nunca pediu — o Mercado Pago exige e-mail em qualquer pagamento, e a
Efí não exigia.

O **endereço do boleto sai da empresa emissora**, não de quem paga: é a empresa
que a gente conhece. Quando falta, a recusa diz exatamente isso, porque "informe
o endereço" faria o comprador procurar um campo que não existe na tela dele.

O webhook passou a atender as **duas famílias** de cobrança. O id do Mercado
Pago é único entre elas, então procurar nas duas é seguro; deixar de procurar
numa delas faria a cobrança nascer e nunca fechar. Entregável pago libera o
arquivo e avisa o comprador (`markDeliverablePaidAndNotify`), que já era
idempotente.

Com isto, **nenhuma cobrança nova nasce na Efí**. O `/api/webhooks/efi`
continua no ar só para as que já estavam abertas.

## 7. Verificado em 30/08/2026

- `tsc --noEmit` e `eslint` limpos; `next build` completo.
- 49 testes unitários passando.
- Os testes de integração de cobrança (`tests/integration/assinaturas.test.ts`)
  foram **atualizados** para o contrato novo (a recusa por documento mudou de
  frase, e entraram dois casos para o endereço), mas **não foram executados**:
  o Postgres desta máquina está sem as migrações aplicadas
  (`operations.subscriptions` não existe). Rodar antes de confiar neles.
- Nenhuma cobrança real foi emitida.
