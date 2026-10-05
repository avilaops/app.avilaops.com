# Blueprint — Módulo de Pagamentos e Tesouraria

_Atualizado em 2026-10-05 · Nicolas_

Como dono, quero um lugar só pra cuidar do meu dinheiro: ver se os gateways estão de pé, cobrar o cliente, receber e acompanhar — sem SSH e sem planilha paralela. Este é o mapa do que o módulo faz hoje e do que ainda vou desenvolver.

> Legenda: **[já funciona]** entregue · **[infra pendente]** código pronto, falta ligar fora do app · **[a desenvolver]** próxima fatia.

## Ver tudo num lugar **[já funciona]**

Eu abro **Financeiro → Integrações** e, sem sair da tela, vejo:

- **Saúde do PayPal** — se a credencial está válida, se o webhook está configurado e apontando pro endereço certo. Um botão **"Diagnosticar agora"** confere na hora: é o mesmo teste que antes só dava pra fazer por SSH no servidor.
- **Recebíveis** — quanto tenho em aberto, pago e vencido, puxado da fonte real (nada de número digitado à mão).
- **Eventos** de PayPal, Mercado Pago e WhatsApp — cada aviso que o gateway mandou, com horário e a evidência bruta, pra eu conferir quando um cliente jurar que pagou.

Antes eu dependia de alguém abrir o servidor pra saber se o dinheiro entrou. Agora é uma tela.

## Cobrar um cliente **[já funciona]**

Quando preciso cobrar, eu começo pela ficha do cliente:

1. **Vinculo o serviço** (Lojas, E-mail, Comandeiro, site…) e defino a assinatura: valor, ciclo e dia de vencimento. Num passo só nascem a assinatura, o contrato e a primeira fatura.
2. **A fatura vira cobrança** no trilho certo — e o sistema escolhe pelo país do cliente: no Brasil é **Mercado Pago** (Pix, boleto, cartão); fora do Brasil é **PayPal**.
3. Sai o que o cliente precisa pra pagar: **Pix copia-e-cola**, **boleto com linha digitável**, ou **link de pagamento**.

Não preciso abrir o gateway nem sair do painel: a cobrança nasce dentro do Ávila OS.

## Escolher o que mandar **[já funciona]**

Na hora de enviar, eu escolho o conteúdo:

- **Boleto / link de pagamento** — o jeito de pagar (boleto, Pix ou checkout).
- **Fatura (resumo)** — só o aviso: valor, competência e vencimento, sem link. Serve pra avisar antes de cobrar.
- **Fatura + boleto** — os dois juntos, numa mensagem só.

Assim eu adapto ao momento: um lembrete amigável, a cobrança em si, ou os dois de uma vez.

## Enviar ao cliente **[e-mail: já funciona · WhatsApp: infra pendente]**

Na ficha do cliente, cada fatura que não está cancelada ganha quatro botões — teste e cliente, um par por canal:

- **Enviar teste por e-mail** e **Enviar teste por WhatsApp** — mandam pra um destino que eu digito na hora, nunca pro cliente.
- **Enviar ao cliente por e-mail** e **Enviar ao cliente por WhatsApp** — mandam pro cliente de verdade, depois de eu confirmar.

Sobre os canais:

- **E-mail** vai pro endereço cadastrado do cliente. Já funciona (sai pelo nosso servidor, via n8n).
- **WhatsApp** vai pro número cadastrado. O caminho no app está pronto; falta ligar o envio na infra (um fluxo no n8n + um modelo de mensagem aprovado pela Meta) pra sair de verdade.

**Teste e cliente real não se misturam:** o botão de teste pergunta pra onde mandar (meu próprio e-mail/número); se eu deixar em branco, nada é enviado. Pro **cliente real** só sai pelo botão dele, e ainda pede confirmação antes — não dá pra disparar sem querer.

**O envio fica registrado na auditoria, em dois tempos**, pra não existir mensagem que saiu sem rastro:

1. **Antes de enviar**, o sistema grava que o envio começou: quem pediu, pra qual cliente, por qual canal, o que ia ser enviado e se era teste. Se nem isso ele consegue gravar, responde erro (503, "Nada foi enviado") e nenhuma mensagem sai.
2. **Depois**, grava o desfecho, apontando pro primeiro registro: **enviado**; **falhou** (o provedor não entregou); **recusado** (nem tentou: fatura cancelada ou já paga, cobrança expirada, sem destino cadastrado); ou **erro** inesperado. Tentativa que não saiu fica como falha, não como contato feito.

Todos esses registros entram na trilha do cliente dono da fatura — o "começou" inclusive, e o teste também, marcado como teste. Enviado e falhou guardam ainda o destino. Pedido barrado antes disso (sem login, quem não é dono, canal inválido, teste sem destino) não gera registro nenhum.

Se a mensagem saiu e o desfecho não foi gravado, a resposta não vem como um "ok" limpo: vem com `registrado: false` e um aviso, e o painel mostra "Enviado…" seguido do aviso, em destaque de erro. Na trilha fica só o "começou", que nesse caso quer dizer "pode ter saído e eu não sei".

O "começou" que ficou sem desfecho já tem como ser listado: uma consulta pronta no código devolve esses envios, de todos os clientes ou de um só.

Limites de hoje: esses registros ainda não aparecem em nenhuma tela (ficam no banco), e a consulta dos envios sem desfecho também não — nada avisa sozinho; os registros de "começou", recusado e erro gravados até 05/10/2026 saíram sem o cliente (`organizationId`) e só se acham pela fatura ou cobrança; e se o sistema não consegue descobrir o cliente na hora (fatura que não existe, banco fora), o "começou" sai sem ele como antes.

## Acompanhar e me proteger **[parcial]**

Depois de cobrar, eu acompanho e confio no que vejo:

- **Status da cobrança** (emitida, paga, vencida) — vem do aviso do gateway, mas confirmado na fonte: o aviso é aviso; quem diz se entrou dinheiro é a API.
- **Conciliação** — as entradas batem com as faturas, e todo número na tela abre a evidência (origem, horário, dado bruto).
- **Auditoria** — toda ação que fala com cliente ou mexe em dinheiro deixa rastro.
- **Pagamento que não abate fatura deixa rastro** — quando o dinheiro entra e a fatura já estava coberta (no todo ou em parte), o pagamento fica guardado no ledger (`core.payments`) e a auditoria ganha um registro: `PAGAMENTO_SEM_ALOCACAO` (nada abateu) ou `PAGAMENTO_ALOCADO_EM_PARTE` (abateu só o que faltava), com o valor que sobrou. Se a gravação no ledger falha, fica `PAGAMENTO_LEDGER_FALHOU`; quando o gateway reenvia o aviso e dessa vez o pagamento é gravado e alocado, a mesma cobrança ganha `PAGAMENTO_LEDGER_RESOLVIDO`, apontando pra falha — que continua na trilha, nada é apagado. Um registro por pagamento e motivo, mesmo que o gateway repita o aviso ou mande dois ao mesmo tempo: a procura e a gravação do registro rodam sob uma trava do banco pra aquele pagamento e motivo. O saldo é lido e a alocação é gravada na mesma transação, com a fatura travada: dois pagamentos simultâneos da mesma fatura não enxergam o mesmo saldo. Limites de hoje: nenhuma tela lista esses registros (ficam no banco); a falha e a resolução ficam uma vez só por cobrança, então uma segunda falha na mesma cobrança não deixa registro novo; e se a própria gravação da auditoria falhar sobra só o log do servidor — a baixa da cobrança não é desfeita.

Regras que me protegem:

- **Só o dono** vê e mexe em dinheiro; a equipe opera o resto.
- **Nada de dado inventado:** se a API não respondeu, a tela diz que não respondeu.
- **Trilho por país:** Brasil = Mercado Pago, fora = PayPal.

## O que ainda vem **[a desenvolver]**

A visão é **tesouraria completa** — ver, cobrar e pagar — construída em partes. O que ainda vou desenvolver:

- **Ledger único (recebimento num lugar só):** o que entra pelo gateway (PayPal, Mercado Pago) já cai no ledger (`core.payments`), alocado na fatura. Falta o extrato do banco cair no mesmo lugar: a conciliação ainda grava em outro registro (`ledgerEntry`). Quando os dois se encontrarem, meus recebíveis ficam certos sozinhos.
- **Cobrar e pagar completo:** além de receber, também registrar e fazer pagamentos (saídas) pelo painel.
- **Multimoeda (Wise):** receber e ver em outras moedas, não só em real.
- **Envio automático (opcional):** mandar a cobrança sozinha ao emitir, quando eu confiar no fluxo — hoje é sempre no meu clique.

Cada parte entra como uma **fatia própria, testada e publicada**, pra não quebrar o que já funciona.

---

## Onde isso vive no código (referência técnica)

- Envio: `src/lib/entrega-cobranca.ts`, `src/lib/whatsapp-saida.ts`, botões em `src/components/OperacaoPanel.tsx`.
  - Rota que o painel chama: `src/app/api/billing/faturas/[id]/enviar/route.ts` — envia a partir da **fatura**; por isso dá pra mandar o resumo antes de existir cobrança e, havendo cobrança, vai a mais recente.
  - Rota irmã: `src/app/api/cobrancas/[id]/enviar/route.ts` — envia a partir de uma **cobrança** específica já emitida. Existe, mas nenhuma tela chama hoje.
  - As duas passam por `responderEnvio` (`src/lib/entrega-cobranca-http.ts`): só o dono, modo de teste por padrão e o registro em `operations.audit_events` em dois tempos — `COBRANCA_ENVIO_INICIADO` antes de enviar (com o `organizationId` do dono da fatura, lido antes; se a gravação falha, 503 e nada sai) e depois o desfecho com `tentativaId` no `metadata`: `COBRANCA_ENVIADA`, `COBRANCA_ENVIO_FALHOU`, `COBRANCA_ENVIO_RECUSADO` ou `COBRANCA_ENVIO_ERRO`. Desfecho não gravado: `registrado: false` na resposta, lido em `enviarCobranca` no `OperacaoPanel.tsx`.
  - Envios sem desfecho: `listarEnviosSemDesfecho` em `src/lib/auditoria-envio-cobranca.ts` — as intenções que nenhum desfecho com o mesmo `tentativaId` fechou. Só biblioteca: nenhuma tela ou rota chama ainda.
- Painel de integrações: `src/app/financeiro/integracoes/page.tsx`, `src/lib/integracoes.ts`, diagnóstico em `src/lib/paypal.ts` (`diagnosticarWebhook`).
- Baixa e ledger: `baixarCobrancaPorIdExterno` em `src/lib/assinaturas.ts` — grava `core.payments`, aloca na fatura dentro de `prisma.$transaction` com `SELECT … FOR UPDATE` em `operations.subscription_invoices` (espera de 5 s e duração de 10 s, em vez dos 2 s e 5 s padrão), e chama `auditarPagamentoForaDaFatura` (`PAGAMENTO_SEM_ALOCACAO`, `PAGAMENTO_ALOCADO_EM_PARTE`, `PAGAMENTO_LEDGER_FALHOU`, `PAGAMENTO_LEDGER_RESOLVIDO`), que procura e grava sob `pg_advisory_xact_lock` da chave ação + entidade + id — sem índice único na tabela.
- Conciliação do extrato (ainda fora do ledger único): `src/lib/conciliacao-automatica.ts` e `src/app/api/reconciliations/[id]/route.ts` gravam em `ledgerEntry`, não em `core.payments`.
- Emissão/contratação (já existente): `src/lib/assinaturas.ts`, `src/lib/nucleo/contratacao.ts`.
- Entregue no PR #78 (`avilaops/app.avilaops.com`).
