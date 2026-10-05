# Blueprint — Módulo de Pagamentos e Tesouraria

_Atualizado em 2026-10-04 · Nicolas_

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

**O envio fica registrado na auditoria:** quem mandou, por qual canal, pra qual destino, o que foi enviado e se era teste. O teste também entra, marcado como teste, na trilha do cliente dono da fatura. O envio que foi tentado e não saiu fica gravado como falha, não como contato feito; pedido recusado antes de tentar (fatura cancelada, cobrança expirada, sem destino cadastrado) não gera registro. Dois limites de hoje: esse registro ainda não aparece em nenhuma tela (fica no banco), e ele é gravado depois do envio — se a gravação falhar, a mensagem já saiu e o erro vai só pro log do servidor.

## Acompanhar e me proteger **[parcial]**

Depois de cobrar, eu acompanho e confio no que vejo:

- **Status da cobrança** (emitida, paga, vencida) — vem do aviso do gateway, mas confirmado na fonte: o aviso é aviso; quem diz se entrou dinheiro é a API.
- **Conciliação** — as entradas batem com as faturas, e todo número na tela abre a evidência (origem, horário, dado bruto).
- **Auditoria** — toda ação que fala com cliente ou mexe em dinheiro deixa rastro.

Regras que me protegem:

- **Só o dono** vê e mexe em dinheiro; a equipe opera o resto.
- **Nada de dado inventado:** se a API não respondeu, a tela diz que não respondeu.
- **Trilho por país:** Brasil = Mercado Pago, fora = PayPal.

## O que ainda vem **[a desenvolver]**

A visão é **tesouraria completa** — ver, cobrar e pagar — construída em partes. O que ainda vou desenvolver:

- **Ledger único (recebimento num lugar só):** hoje a cobrança do gateway e a conciliação do banco não se encontram. Quero que todo dinheiro que entra — por PayPal, Mercado Pago ou batido no extrato — caia no mesmo lugar, e aí meus recebíveis ficam certos sozinhos.
- **Cobrar e pagar completo:** além de receber, também registrar e fazer pagamentos (saídas) pelo painel.
- **Multimoeda (Wise):** receber e ver em outras moedas, não só em real.
- **Envio automático (opcional):** mandar a cobrança sozinha ao emitir, quando eu confiar no fluxo — hoje é sempre no meu clique.

Cada parte entra como uma **fatia própria, testada e publicada**, pra não quebrar o que já funciona.

---

## Onde isso vive no código (referência técnica)

- Envio: `src/lib/entrega-cobranca.ts`, `src/lib/whatsapp-saida.ts`, botões em `src/components/OperacaoPanel.tsx`.
  - Rota que o painel chama: `src/app/api/billing/faturas/[id]/enviar/route.ts` — envia a partir da **fatura**; por isso dá pra mandar o resumo antes de existir cobrança e, havendo cobrança, vai a mais recente.
  - Rota irmã: `src/app/api/cobrancas/[id]/enviar/route.ts` — envia a partir de uma **cobrança** específica já emitida. Existe, mas nenhuma tela chama hoje.
  - As duas passam por `responderEnvio` (`src/lib/entrega-cobranca-http.ts`): só o dono, modo de teste por padrão e o registro em `operations.audit_events` (`COBRANCA_ENVIADA` / `COBRANCA_ENVIO_FALHOU`).
- Painel de integrações: `src/app/financeiro/integracoes/page.tsx`, `src/lib/integracoes.ts`, diagnóstico em `src/lib/paypal.ts` (`diagnosticarWebhook`).
- Emissão/contratação (já existente): `src/lib/assinaturas.ts`, `src/lib/nucleo/contratacao.ts`.
- Entregue no PR #78 (`avilaops/app.avilaops.com`).
