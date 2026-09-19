# Mercado Pago: auditoria do que existe e roadmap do que falta (19/09/2026)

> Pergunta que originou este documento: "configurar o Mercado Pago no
> app.avilaops.com para o recebimento dos serviços das aplicações".
>
> A resposta curta é que **a integração já existe e cobra de verdade** — o que
> falta não é construir o trilho, é consertar três coisas que decidem se o
> dinheiro entra na conta certa, se a baixa da fatura chega, e se quem manda a
> notificação é mesmo o Mercado Pago. Este documento separa o que está de pé do
> que está pendente, com o arquivo e a linha de cada afirmação.

## 1. O veredito em quatro linhas

1. **Cobrar já funciona**: PIX, boleto e cartão saem pela API, com idempotência,
   e a baixa da fatura é idempotente.
2. **O dinheiro entra na conta errada.** O token em uso é de uma conta pessoa
   física; o CNPJ da casa é outro login, lido só para extrato.
3. **A baixa automática é uma aposta.** Nenhuma cobrança diz ao Mercado Pago
   para onde notificar, e a URL única da aplicação está disputada entre dois
   sistemas.
4. **Ninguém prova quem notificou.** O webhook aceita sem assinatura; a defesa
   real é a reconsulta à API, que é boa, mas é a segunda linha, não a primeira.

## 2. O que já está de pé (não refazer)

| Peça | Onde | Estado |
|---|---|---|
| Cliente único da API, com timeout e idempotência | `src/lib/mercadopago.ts` | Pronto |
| PIX, boleto e cartão da fatura | `src/lib/mercadopago-cobranca.ts` | Pronto |
| Regra de cobrança, bloqueios por dado faltante, parcelamento | `src/lib/assinaturas.ts` | Pronto |
| Webhook que confirma na fonte antes de dar baixa | `src/app/api/webhooks/mercadopago/route.ts` | Pronto, sem assinatura |
| Extrato e conciliação (venda × compra, estorno, chargeback) | `src/lib/sync-mercadopago.ts` | Pronto |
| Painel do dono, com diagnóstico de webhook e divergências | `src/app/financeiro/mercadopago/`, `src/lib/mercadopago-painel.ts` | Pronto |
| Link de cobrança avulsa | `src/lib/mercadopago.ts`, `/financeiro/mercadopago/cobrar` | Pronto |
| Fatura paga pelo próprio cliente (PIX e boleto) | `/portal`, `src/app/api/portal/faturas/[id]/cobrar/route.ts` | Pronto |
| Porta máquina-a-máquina para os produtos cobrarem | `src/app/api/billing/*` (JWT de serviço) | Pronto |
| Contratação idempotente (conta + assinatura + 1ª fatura + PIX) | `src/lib/contratacao.ts` | Pronto |
| Fora do Brasil sai por PayPal | `src/lib/paypal.ts` | Pronto |
| Dinheiro é só do dono (`ehDono`) em todas as rotas de cobrança | rotas em `src/app/api/mercadopago/*` | Pronto |

As três rotas de webhook respondem em produção (`405` para GET, que é o
esperado: só aceitam POST). Conferido em 19/09/2026.

## 3. Achados

### P0 — decidem se o dinheiro entra e se a fatura fecha

**P0-1. Quem recebe pelos serviços é uma conta pessoa física.**
`docs/mercadopago-extrato-conta-cnpj.md` registra: o `MP_ACCESS_TOKEN` do app
pertence à conta `nicolas@avila.inc` (id 2944732714), cuja história é *uma
compra de fone de R$ 24,90*. O histórico da casa está no login do **CNPJ
67.954.417** (`nicolas@avilaops.com`), que hoje só é **lido** pelo n8n para o
extrato. Ou seja: receita de serviço prestado por pessoa jurídica cai numa
conta de pessoa física.

Consequência concreta: a receita não tem como ser comprovada no CNPJ, a nota
fiscal do serviço não casa com o recebimento, e a taxa aplicada é a de PF. É o
achado que trava os outros — migrar o token depois de ter cartão salvo,
assinatura recorrente e webhook apontado custa muito mais do que migrar agora.

**P0-2. Nenhuma cobrança diz para onde notificar, e a URL única está disputada.**
Nenhum `POST /v1/payments` nem preferência envia `notification_url` (busca por
`notification_url` em `src/` não retorna nada). Sem esse campo, o Mercado Pago
usa a URL global da aplicação — e o repositório carrega **duas verdades sobre
qual deve ser**:

- `docs/cobranca-mercado-pago.md` §6.1 manda apontar para
  `https://app.avilaops.com/api/webhooks/mercadopago`;
- `src/lib/mercadopago-painel.ts:24` define
  `WEBHOOK_ESPERADO = "https://lojas.avilaops.com/api/webhooks/mercadopago-assinatura"`
  e a tela do dono marca **erro** quando a URL é diferente dessa.

Uma aplicação do Mercado Pago tem uma URL global. Do jeito que está, quem
estiver certo faz o outro estar errado: se aponta para as lojas, a fatura deste
app só fecha quando alguém clicar em sincronizar; se aponta para o app, a
assinatura das lojas deixa de ser notificada.

A saída não é escolher: a API aceita `notification_url` **por cobrança**
(documentação oficial de webhooks e de `POST /v1/payments`). Cada cobrança
nascida aqui carrega o endereço deste app, e a URL global fica livre para as
lojas. Enquanto isso não existir, a baixa automática depende de uma
configuração de painel que nenhum teste protege — e já falhou antes, quando o
`cliente.avilaops.com` foi desligado e ninguém percebeu.

**P0-3. O webhook não verifica assinatura.**
`src/app/api/webhooks/mercadopago/route.ts:38-39`: a autorização é um token na
query string e, **sem `MP_WEBHOOK_TOKEN` configurado, aceita qualquer
chamada**. O Mercado Pago assina toda notificação em `x-signature` (HMAC-SHA256
sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, com segredo por
aplicação). O contraste dentro da própria casa é o argumento: o webhook do
PayPal **recusa** a notificação sem `PAYPAL_WEBHOOK_ID` (`.env.example`:
"não se libera acesso pago confiando em cabeçalho não verificado"). O gateway
que traz o dinheiro é o menos protegido dos três.

A reconsulta à API (`getPagamentoStatus`) continua sendo o que de fato protege
o saldo — nenhum POST forjado inventa um pagamento aprovado. Mas ela protege o
**valor**, não o **endpoint**: hoje qualquer um pode fazer o app consultar ids
à vontade, e a única trava é o id já existir como cobrança nossa.

**P0-4. As variáveis do Mercado Pago não estão no `.env.example`.**
Zero ocorrências de `MP_` em `.env.example`, que documenta 128 linhas de
ambiente — inclusive a Efí, que já **não** cobra mais nada novo. Faltam
`MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_WEBHOOK_TOKEN` e `MP_SYNC_DAYS`.
Quem subir o app do zero configura o gateway morto e esquece o vivo.

No mesmo assunto: `src/lib/mercadopago.ts:37` lê o token de
`../docs/.env.production` quando o ambiente não tem a variável. É um atalho de
desenvolvimento que já derrubou o build uma vez (registrado no próprio
comentário) e que mantém segredo de produção sendo lido de arquivo.

### P1 — a operação depende de alguém lembrando

**P1-5. Nenhuma fatura nasce sozinha, e nenhuma vence sozinha.**
`garantirFatura` só é chamado por rota de admin, pela contratação e por um
script (`scripts/criar-assinatura.ts`, que escreve "a fatura é gerada pelo job
mensal" — **esse job não existe neste repositório**). Não há cron no repo
(`.github/workflows/` tem só deploy e prints) e nada envelhece `OPEN` para
`OVERDUE`. A varredura de inadimplência que existe (`/api/mercadopago/varredura`)
é da plataforma de lojas, não das assinaturas deste banco.

Consequência: a mensalidade do mês 2 de qualquer cliente contratado pelo
autoatendimento só existe se alguém abrir a ficha e clicar.

**P1-6. Cobrança de entregável é gravada com o gateway errado.**
`prisma/schema.prisma:1244` mantém `DeliverableCharge.provider @default("EFI")`,
e as duas criações em `src/app/api/entregaveis/[token]/charges/route.ts:183` e
`:235` **não passam `provider`** — embora chamem `createPixCharge` e
`createBoletoCharge` do Mercado Pago. Toda cobrança de entregável desde a
migração de 31/08/2026 está rotulada como Efí no banco. Qualquer relatório por
gateway, e qualquer conciliação de taxa por gateway, começa errado.

**P1-7. Cartão é caminho morto — de ponta a ponta.**
O backend sabe cobrar no cartão (`createCardCharge`), a rota aceita
`paymentToken`, `paymentMethodId` e `issuerId`, o parcelamento é calculado em
casa. Mas não existe `MP_PUBLIC_KEY` em nenhum lugar do código, nem SDK do
Mercado Pago no front (busca por `sdk.mercadopago`, `cardForm`, `bricks`: nada),
e o portal só oferece PIX e boleto (`src/components/FaturasDoCliente.tsx:135,138`).
O doc de 30/08 já registrava isso como pendência; 20 dias depois segue igual.

**P1-8. Estorno é código morto que a documentação afirma existir.**
`src/lib/mercadopago.ts:445` exporta `estornarPagamento`, com o comentário "por
isso a tela pede confirmação digitada em vez de um clique só". **Nenhuma tela e
nenhuma rota chamam essa função** — a busca por `estorn` em `src/` só encontra
rótulos e textos. Não existe a tela, não existe a confirmação, e um estorno
feito pelo painel do Mercado Pago não gera evento de auditoria aqui.

### P2 — o que se descobre tarde

**P2-9. Estorno e contestação não avisam ninguém.** O webhook ignora, com 200,
tudo que não é `payment` (`route.ts:87`) — o que é correto para não travar a
fila do Mercado Pago, mas significa que `chargeback` só aparece quando o sync do
extrato roda e reclassifica a linha. Dinheiro saindo da conta por contestação
não gera alerta em lugar nenhum.

**P2-10. A taxa do Mercado Pago não entra em nenhuma conta.** O extrato grava o
valor **bruto**, de propósito e com bom motivo (lançar líquido esconderia a
taxa). Mas o líquido só é exibido numa coluna de tela
(`src/app/financeiro/mercadopago/page.tsx:245`): a diferença não vira lançamento,
não vira categoria de despesa e não entra no resultado. A margem real de cada
mensalidade é desconhecida.

**P2-11. O caminho do dinheiro não tem teste.** Existe
`tests/integration/webhook-efi.test.ts` para o gateway aposentado, e **nenhum
teste do webhook do Mercado Pago** nem de `mercadopago-cobranca.ts`. Só
`tests/unit/sync-mercadopago.test.ts` cobre a leitura do extrato. Além disso,
`docs/cobranca-mercado-pago.md` §7 registra que os testes de integração de
cobrança foram atualizados e **nunca executados**.

**P2-12. Notificação recebida não deixa rastro.** O webhook devolve 500 e confia
no reenvio do Mercado Pago — o que é a decisão certa —, mas não grava o evento.
O schema já tem `IntegrationWebhookEvent` (`prisma/schema.prisma:1164`), usado
por outras integrações e não por esta. Quando uma baixa não acontece, não há
como saber se a notificação chegou.

### P3 — dívidas conhecidas, sem pressa

**P3-13. Nada emite nota fiscal do serviço.** O módulo `src/lib/fiscal/` lê
NF-e **recebida** pela SEFAZ (DistDFe, manifestação, certificado A1). Não há
emissão de NFS-e: fatura paga não gera nota. Amarrado ao P0-1 — sem receber no
CNPJ, não há o que emitir.

**P3-14. O doc de 30/08 está desatualizado em um ponto.** §2 afirma que
"não há coluna de gateway em `SubscriptionCharge`". Há: `provider`
(`schema.prisma:1352`, default `MERCADO_PAGO`), criada na migração
`20260912143000_subscription_charge_paypal`. A baixa por `externalId`
(`assinaturas.ts:538`) continua não filtrando por ela.

**P3-15. Pix enviado/recebido por saldo não sai da API** (registrado em
`docs/mercadopago-extrato-conta-cnpj.md`). Depende de importar o CSV de
Atividade, e o importador ainda não existe.

## 4. Roadmap

Ordem escolhida por um critério só: **primeiro o que decide onde o dinheiro
cai, depois o que garante que a casa sabe que ele caiu, depois conveniência.**
Cada fase é entregável sozinha.

### Fase 0 — a decisão que não é de código (bloqueia tudo)

Sem isto, qualquer coisa construída depois é construída no lugar errado.

**Decidido pelo Nicolas em 19/09/2026: migração progressiva, não corte bruto.**

- **Cobrança nova passa para a conta do CNPJ 67.954.417.** Todo cliente novo
  entra exclusivamente por ela.
- **PIX, boleto e link avulso antigos ficam onde estão.** O histórico não se
  migra; só deixa de receber cobrança nova.
- **Assinaturas e cartões salvos na conta PF não se quebram.** Os contratos
  atuais terminam onde estão, ou migram de forma controlada, pedindo nova
  autorização de cartão pela conta PJ. Cartão salvo não se transfere entre
  contas — é o titular que autoriza.

O que gerar no painel de desenvolvedor **da conta do CNPJ**:

1. `APP_USR-` de produção → `MP_ACCESS_TOKEN`.
2. Aplicação própria para o `app.avilaops.com` → `MP_CLIENT_ID` (a aplicação de
   hoje é da conta PF, e é dela que sai o diagnóstico de webhook da tela).
3. **Segredo de assinatura de webhook** dessa aplicação → insumo do P0-3.
4. Public Key, se o cartão da Fase 3 for entrar → `MP_PUBLIC_KEY`.

#### As três consequências da troca de token (verificadas em código)

Nenhuma delas é motivo para não trocar. Todas são motivo para trocar na ordem
certa.

**1. O extrato passa a contar cada pagamento duas vezes.** A unicidade de
`bank_transactions` é `(accountId, externalId)` (`sync-mercadopago.ts:184`) e o
id da conta do token é fixo em `"mercadopago-production"`. Com o token novo, o
app grava os pagamentos da conta PJ ali, enquanto o workflow do n8n
(`NV72KXfoSZceQtlP`) continua gravando **os mesmos pagamentos** em
`mercadopago-cnpj`: dois lançamentos por venda, "Entradas · 30 dias" dobrada e
duas conciliações pendentes para cada uma. **Desligar esse workflow faz parte da
troca**, não é limpeza posterior. A rota `/importar` já recusa gravar como
`mercadopago-production` (`route.ts:49`), então não há como resolver mandando o
n8n gravar na mesma conta.

**2. Cobrança aberta na conta PF deixa de fechar sozinha.** O webhook confirma
na fonte com o token do app. Um PIX emitido na PF e notificado depois da troca é
reconsultado com o token PJ, que não conhece aquele pagamento: 500, reenvio
eterno do Mercado Pago, fatura aberta com o dinheiro na conta. A janela é
conhecida — PIX expira em 24h, boleto em 3 dias. Então: **parar de emitir boleto
uns 3 dias antes da troca**, ou dar baixa à mão nas que atravessarem.

**3. A tela `/financeiro/mercadopago` esvazia.** Ela lista assinaturas pelo
token, e as assinaturas das lojas ficam na PF por decisão desta fase. Depois da
troca, o painel marca "o Mercado Pago não conhece esta assinatura" para **todas**
as lojas ativas: divergência vermelha em cima de um estado saudável. Enquanto as
duas contas coexistirem, o painel precisa ler as duas ou dizer em tela que só vê
a nova — item que entrou na Fase 1 por causa desta decisão.

**Pronto quando**: o token novo está no cofre (`PlatformCredential`, categoria
`mercadopago`), o workflow do n8n da conta CNPJ está desligado, e não há cobrança
da conta PF em aberto (ou a baixa manual dela está combinada).

### Fase 1 — o dinheiro cai na conta certa e a baixa chega

- `notification_url` em toda cobrança nascida aqui (`createPixCharge`,
  `createBoletoCharge`, `createCardCharge`, `criarLinkPagamento`), montada de
  `APP_URL` + `/api/webhooks/mercadopago` + o token, se houver. Resolve P0-2 sem
  disputar a URL global com as lojas.
- Verificação de `x-signature` no webhook, com `MP_WEBHOOK_SECRET`: ausente,
  segue no comportamento de hoje (compatível); presente, **recusa 401** o que
  não bate. Resolve P0-3.
- `MP_ACCESS_TOKEN` do CNPJ em produção, e `MP_*` documentadas no
  `.env.example`. Resolve P0-4.
- Remover o fallback de leitura de `docs/.env.production`.
- Teste do webhook, espelhando `webhook-efi.test.ts`: assinatura válida,
  inválida, ausente, evento repetido, id desconhecido, tópico que não é
  pagamento. Sem isto, nada acima é verificável. Resolve parte do P2-11.
- **O painel diz de qual conta está falando.** Com a migração progressiva da
  Fase 0, as assinaturas das lojas ficam na conta PF e o token é da PJ: a tela
  precisa ler as duas contas, ou avisar em tela que só enxerga a nova. Sem isso
  ela acusa divergência em toda loja ativa, e um painel que grita errado deixa de
  ser lido — que é o oposto do motivo dele existir.

Ordem interna que não se inverte: **a variável entra no servidor antes do código
que a exige.** Subir o "recusa sem segredo" com o segredo ainda ausente para a
baixa de todas as faturas de uma vez.

**Pronto quando**: uma cobrança de teste emitida em produção fecha a fatura
sozinha, e o painel do dono mostra o webhook em verde — conferido no navegador,
não só na API.

### Fase 2 — a mensalidade se cobra sozinha

- Rotina mensal de faturamento: para cada `Subscription` ativa, `garantirFatura`
  da competência e a primeira cobrança PIX. Idempotente pelo índice único que já
  existe, então reexecutar é seguro — e é isso que torna aceitável agendar no
  n8n como os outros fluxos (`x-service-key`, o padrão do `sync`).
- Envelhecimento `OPEN` → `OVERDUE` no vencimento, e aviso ao cliente.
- Régua: lembrete antes de vencer, aviso no vencimento, aviso de atraso. Cada
  passo gera evento de auditoria — conciliação e exportação já geram, e cobrança
  automática é a que mais precisa de rastro.
- Corrigir o `provider` dos entregáveis (default do schema e as duas criações),
  com migração aditiva, e decidir se as linhas antigas são corrigidas por script.
  Resolve P1-6.

**Pronto quando**: um cliente contratado pelo autoatendimento recebe a fatura do
mês seguinte sem ninguém abrir o painel.

### Fase 3 — o cartão sai do papel e o estorno sai do limbo

- Formulário de cartão com o SDK do Mercado Pago (`MP_PUBLIC_KEY` nova
  variável), mandando `token`, `paymentMethodId` e `issuerId` — os três, senão
  bandeira menos comum é recusada. A rota já aceita. Resolve P1-7.
- Tela de estorno para o dono, com confirmação digitada, ligada a
  `estornarPagamento`, gerando `FinanceAuditEvent`. Ou remover a função, se a
  decisão for estornar pelo painel do Mercado Pago — o que não se sustenta é o
  código morto com comentário descrevendo uma tela inexistente. Resolve P1-8.
- Webhook passa a tratar `chargebacks` e estorno: registra, alerta e lança no
  extrato na hora, em vez de esperar o sync. Resolve P2-9.

### Fase 4 — a casa sabe quanto sobra

- Taxa do Mercado Pago como lançamento próprio (bruto − líquido já vem em
  `net_received_amount`), categorizada como despesa de gateway. Resolve P2-10.
- `IntegrationWebhookEvent` gravado para cada notificação do Mercado Pago:
  recebida, verificada, resultado. Resolve P2-12.
- Margem por mensalidade e por cliente no `/relatorios`, com a evidência
  clicável que a regra da casa exige.

### Fase 5 — fiscal

- NFS-e da mensalidade, disparada pela baixa da fatura. Só depois da Fase 0: nota
  do CNPJ com recebimento em conta PF é divergência que ninguém quer explicar.
- Importador do CSV de Atividade do Mercado Pago, para o Pix por saldo que a API
  não entrega.

## 5. O que este documento não propõe, e por quê

- **Trocar de gateway.** A decisão de 30/08 é recente, o trilho funciona e a
  Efí saiu por decisão explícita. Nada aqui é argumento para voltar atrás.
- **Split de pagamento / marketplace.** A Ávila Ops cobra pelos próprios
  serviços; não repassa dinheiro a terceiros. Complexidade sem problema para
  resolver.
- **Cobrar dentro das aplicações dos clientes.** Cada loja já tem a credencial
  Mercado Pago dela, cifrada no `lojas.avilaops.com`. O que este app cobra é a
  **mensalidade da Ávila Ops** — misturar os dois papéis no mesmo módulo é o
  caminho para alguém receber na conta errada.
- **Checkout público sem sessão.** O que existe hoje (portal com sessão, link
  avulso, token de entregável, JWT de serviço para os produtos) cobre os casos
  reais. Uma rota pública de cobrança é superfície de ataque sem demanda.

## 6. Como verificar o que este documento afirma

```bash
grep -rn "notification_url" src/          # vazio: P0-2
grep -n "WEBHOOK_ESPERADO =" src/lib/mercadopago-painel.ts
grep -n "MP_WEBHOOK_TOKEN" -A 2 src/app/api/webhooks/mercadopago/route.ts
grep -c "MP_" .env.example                # 0: P0-4
grep -rn "estorn" src/ --include="*.ts"   # nenhuma chamada: P1-8
grep -n 'default("EFI")' prisma/schema.prisma          # P1-6
ls tests/integration/                     # sem webhook-mercadopago: P2-11
```

Toda afirmação de estado neste documento saiu de leitura de código em
19/09/2026. **Nada foi alterado e nenhuma cobrança foi emitida.** As duas
contas do Mercado Pago, os saldos e a configuração do painel não são
verificáveis daqui: dependem de quem tem o login.
