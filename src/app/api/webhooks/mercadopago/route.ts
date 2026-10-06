import { NextRequest, NextResponse } from "next/server";
import { baixarCobrancaPorIdExterno } from "@/lib/assinaturas";
import { markDeliverablePaidAndNotify } from "@/lib/deliverables";
import { concluirEvento, registrarEvento } from "@/lib/eventos-webhook";
import { consultarPagamento } from "@/lib/mercadopago-cobranca";
import { segredoDoWebhook, verificarAssinatura } from "@/lib/mercadopago-assinatura";
import { prisma } from "@/lib/prisma";

/**
 * Notificação do Mercado Pago sobre a mensalidade.
 *
 * Vale aqui a mesma regra do webhook do Efí, e pelo mesmo motivo: **o corpo do
 * POST é aviso, não prova**. Ele chega por HTTP, é reenviado pelo próprio
 * Mercado Pago, pode chegar fora de ordem e diz apenas o id. O id é uma pista;
 * quem diz se entrou dinheiro é a API.
 *
 * O que mudou em 19/09/2026: além dessa regra, a notificação agora precisa
 * **provar que veio do Mercado Pago** (`x-signature`, verificada em
 * `mercadopago-assinatura.ts`) antes de o endpoint fazer qualquer coisa — e
 * sem o segredo configurado ele não processa nada. Confiar na reconsulta era
 * suficiente para proteger o saldo, mas deixava o endpoint aberto para
 * qualquer um fazer o app consultar ids à vontade.
 *
 * E **o endpoint é idempotente por natureza**: receber o mesmo evento dez
 * vezes tem que dar no mesmo. A baixa guarda o instante do pagamento e não
 * deixa cobrança paga voltar para pendente.
 *
 * O webhook do Efí continua no ar de propósito (`/api/webhooks/efi`): as
 * cobranças abertas nela ainda vão ser pagas. Este trata só as novas.
 */

/** Único estado do Mercado Pago que significa dinheiro liberado. */
const PAGO = "approved";

/**
 * Primeira barreira: o token na URL, igual ao do Efí.
 *
 * Continua valendo depois da assinatura entrar, e por um motivo prático: é
 * conferido antes de qualquer cálculo, então corta tráfego besta sem custo.
 * Sem `MP_WEBHOOK_TOKEN` configurado, não barra nada — quem barra é a
 * assinatura, abaixo.
 */
function tokenConfere(request: NextRequest): boolean {
  const esperado = process.env.MP_WEBHOOK_TOKEN?.trim();
  if (!esperado) return true;

  const recebido =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-webhook-token") ??
    "";

  return recebido === esperado;
}

/**
 * Segunda barreira, e a que de fato prova quem chamou: `x-signature`.
 *
 * **Falha fechada.** Sem `MP_WEBHOOK_SECRET` no ambiente, este endpoint não
 * processa nada — era o oposto até 19/09/2026, quando a ausência do segredo
 * fazia o webhook aceitar qualquer chamada. O webhook do PayPal, nesta mesma
 * casa, sempre recusou notificação sem o id dele; não havia motivo para o
 * gateway que traz o dinheiro ser o mais aberto dos três.
 *
 * O detalhe que evita perder dinheiro: a recusa por falta de segredo é **503, e
 * não 401**. A culpa é nossa, não de quem chamou, e o Mercado Pago reenvia o
 * que não recebeu 2xx — então, no instante em que o segredo entrar no servidor,
 * os eventos retidos chegam e as faturas fecham sozinhas. Um 401 aqui diria
 * "não insista" para um aviso legítimo, e a fatura ficaria paga com a cobrança
 * aberta até alguém notar à mão.
 *
 * Por isso também a ordem de deploy não se inverte: a variável entra no
 * servidor antes deste código. Ao contrário, toda baixa automática para — e
 * depois volta sozinha, mas para.
 */
async function assinaturaConfere(
  request: NextRequest,
): Promise<{ ok: true } | { ok: false; status: number; erro: string }> {
  const segredo = await segredoDoWebhook();
  if (!segredo) {
    console.error(
      "MP_WEBHOOK_SECRET ausente: notificação do Mercado Pago recusada com 503. " +
        "O Mercado Pago vai reenviar; configure o segredo da aplicação para a baixa voltar.",
    );
    return { ok: false, status: 503, erro: "Webhook sem segredo configurado." };
  }

  const vereditco = verificarAssinatura({
    cabecalho: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    // O manifesto usa o `data.id` da QUERY, não o do corpo. São o mesmo valor
    // quando os dois vêm, mas é o da query que entra na conta.
    dataId: request.nextUrl.searchParams.get("data.id"),
    segredo,
  });

  if (!vereditco.valida) {
    console.warn(`Notificação do Mercado Pago recusada: ${vereditco.motivo}.`);
    return { ok: false, status: 401, erro: "Assinatura inválida." };
  }

  return { ok: true };
}

/**
 * O id do pagamento, das três formas em que o Mercado Pago o manda.
 *
 * Webhooks novos usam `{ type: "payment", data: { id } }`; o IPN antigo manda
 * `?topic=payment&id=`; e algumas integrações mandam `{ resource }` com a URL
 * inteira. Aceitar as três é mais barato do que descobrir em produção qual
 * delas a conta está configurada para enviar.
 *
 * A contestação tem tópico próprio (`topic_chargebacks_wh`), e é por ele que a
 * documentação diz que o desfecho é avisado ("when a chargeback is initiated
 * or its status is changed"); ela não diz que o tópico `payment` repete esse
 * aviso. O tratamento é o mesmo do pagamento — consulta na API e a mesma
 * baixa —, então se os dois tópicos avisarem, o segundo não muda nada.
 */
function idDoPagamento(
  request: NextRequest,
  body: Record<string, unknown> | null,
): string | null {
  const busca = request.nextUrl.searchParams;
  const tipo = String(body?.type ?? body?.topic ?? busca.get("topic") ?? busca.get("type") ?? "");
  const dados = body?.data as { id?: unknown; payment_id?: unknown } | undefined;

  let bruto: string | null;
  if (tipo.includes("chargeback")) {
    // Na contestação o `data.id` é o do caso, não o do pagamento; o do
    // pagamento vem ao lado, em `data.payment_id`.
    bruto = dados?.payment_id !== undefined && dados.payment_id !== null ? String(dados.payment_id) : null;
  } else if (tipo && !tipo.includes("payment")) {
    return null;
  } else {
    bruto =
      (dados?.id !== undefined ? String(dados.id) : null) ??
      busca.get("id") ??
      (typeof body?.resource === "string" ? body.resource.split("/").pop() ?? null : null);
  }

  if (!bruto) return null;

  // Só dígitos: o id do Mercado Pago é numérico, e qualquer outra coisa é
  // tentativa de fazer o endpoint consultar o que não é nosso.
  return /^\d+$/.test(bruto) ? bruto : null;
}

export async function POST(request: NextRequest) {
  if (!tokenConfere(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const assinatura = await assinaturaConfere(request);
  if (!assinatura.ok) {
    return NextResponse.json({ error: assinatura.erro }, { status: assinatura.status });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const pagamentoId = idDoPagamento(request, body);

  // Registro só depois da assinatura: o que não provou ser do Mercado Pago não
  // enche a tabela que o painel de integrações mostra como evidência.
  const busca = request.nextUrl.searchParams;
  const registro = await registrarEvento({
    provider: "mercadopago",
    externalId: pagamentoId ?? (body?.id !== undefined ? String(body.id) : null),
    eventType: String(body?.action ?? body?.type ?? body?.topic ?? busca.get("type") ?? busca.get("topic") ?? "desconhecido"),
    payload: { pagamentoId, requestId: request.headers.get("x-request-id") },
  });

  // Notificação de outro tópico (assinatura, reclamação, alerta de fraude) ou
  // contestação sem o id do pagamento não é erro:
  // devolver 4xx faria a fila do Mercado Pago repetir para sempre um evento
  // que nunca vai ser nosso.
  if (!pagamentoId) {
    await concluirEvento(registro, "IGNORED");
    return NextResponse.json({ ok: true, ignorado: true });
  }

  /*
    Id que não bate com cobrança nossa não vira consulta à API - senão o
    endpoint vira ferramenta de varredura de ids válidos.

    Duas famílias de cobrança usam o mesmo gateway e o mesmo webhook: a
    MENSALIDADE (`SubscriptionCharge`) e o ENTREGÁVEL avulso
    (`DeliverableCharge`). O id do Mercado Pago é único entre as duas, então
    procurar nas duas é seguro; deixar de procurar numa delas é que faria a
    cobrança nascer e nunca fechar.
  */
  const [mensalidade, entregavel] = await Promise.all([
    prisma.subscriptionCharge.findFirst({
      where: { externalId: pagamentoId },
      select: { id: true },
    }),
    prisma.deliverableCharge.findFirst({
      where: { externalId: pagamentoId },
      select: { id: true, deliverableId: true, status: true },
    }),
  ]);

  if (!mensalidade && !entregavel) {
    await concluirEvento(registro, "IGNORED", "Pagamento sem cobrança nossa.");
    return NextResponse.json({ ok: true, desconhecido: true });
  }

  let situacao: string;
  let detalhe: string | null;
  let aprovadoEm: Date | null;
  try {
    ({ status: situacao, detalhe, aprovadoEm } = await consultarPagamento(pagamentoId));
  } catch (erro) {
    console.error(`Falha ao confirmar o pagamento ${pagamentoId} no Mercado Pago`, erro);
    await concluirEvento(registro, "FAILED", erro instanceof Error ? erro.message : "Falha ao consultar o Mercado Pago.");
    // 500 de propósito: aqui a dúvida é NOSSA (a API não respondeu), e o
    // reenvio do Mercado Pago é justamente o que vai resolver.
    return NextResponse.json({ error: "Falha ao confirmar o pagamento." }, { status: 500 });
  }

  if (mensalidade) {
    // `rejected`, `cancelled` e `in_process` também são registrados: o cliente
    // precisa ver na tela que o cartão foi recusado, senão ele fica esperando
    // um "pendente" que nunca vai virar pago.
    // `aprovadoEm` é o instante do Mercado Pago: notificação reenviada depois
    // de uma queda não move o pagamento para o dia do processamento.
    // O `detalhe` vai junto por causa da contestação: é ele que diz como ela
    // terminou, com o status ainda `charged_back`.
    await baixarCobrancaPorIdExterno(pagamentoId, situacao === PAGO ? "approved" : situacao, aprovadoEm, detalhe);
  }

  if (entregavel && situacao === PAGO && entregavel.status !== "PAID") {
    await prisma.deliverableCharge.update({
      where: { id: entregavel.id },
      data: { status: "PAID", paidAt: aprovadoEm ?? new Date() },
    });
    // Libera o arquivo e avisa quem comprou. Idempotente: sai fora sozinho se
    // o entregável já estiver pago.
    await markDeliverablePaidAndNotify(entregavel.deliverableId);
  }

  await concluirEvento(registro, "PROCESSED");
  return NextResponse.json({ ok: true, status: situacao });
}
