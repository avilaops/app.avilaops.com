import { NextRequest, NextResponse } from "next/server";
import { baixarCobrancaPorIdExterno } from "@/lib/assinaturas";
import { assinaturaConfere, consultarAssinatura, consultarCaptura, paypalConfigurado } from "@/lib/paypal";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Notificação do PayPal, o trilho de quem paga de fora do Brasil.
 *
 * Vale a mesma regra dos webhooks do Mercado Pago e do Efí, e pelo mesmo
 * motivo: **o corpo do POST é aviso, não prova**. Chega por HTTP, é reenviado
 * pelo próprio PayPal, pode vir fora de ordem e pode ser forjado por quem
 * conheça o formato. Quem diz se entrou dinheiro é a API.
 *
 * Aqui há uma camada a mais que os outros não têm: o PayPal assina cada
 * notificação e oferece uma rota para verificar essa assinatura. A verificação
 * é obrigatória, e sem `PAYPAL_WEBHOOK_ID` configurado o endpoint recusa em vez
 * de aceitar sem conferir. Preferir recusar é o certo quando o assunto é
 * liberar acesso pago.
 *
 * **Idempotente por natureza**: receber o mesmo evento dez vezes dá no mesmo.
 * A baixa guarda o instante do pagamento e não deixa cobrança paga voltar para
 * pendente.
 */

/** Eventos que mexem em dinheiro. O resto é registrado e ignorado. */
const DE_PAGAMENTO = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
]);

const DE_ASSINATURA = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
]);

export async function POST(request: NextRequest) {
  // Corpo cru: a assinatura do PayPal foi feita sobre estes bytes, e
  // reserializar o JSON mudaria espaço em branco e derrubaria a verificação.
  const bruto = await request.text();

  if (!paypalConfigurado()) {
    console.error("[paypal] webhook chegou sem PAYPAL_CLIENT_ID/SECRET configurados");
    return NextResponse.json({ erro: "PayPal não configurado." }, { status: 503 });
  }

  if (!(await assinaturaConfere(request.headers, bruto))) {
    return NextResponse.json({ erro: "Assinatura não confere." }, { status: 401 });
  }

  const evento = JSON.parse(bruto || "{}") as {
    id?: string;
    event_type?: string;
    resource?: { id?: string; status?: string; custom_id?: string };
  };
  const tipo = evento.event_type ?? "";
  const recursoId = evento.resource?.id;

  await registrar(evento.id, tipo, recursoId);

  if (!recursoId) return NextResponse.json({ ok: true, ignorado: true });

  try {
    if (DE_PAGAMENTO.has(tipo)) {
      // A API é a fonte: o status que veio no aviso não decide nada.
      const captura = await consultarCaptura(recursoId);
      const baixa = await baixarCobrancaPorIdExterno(recursoId, captura.status);
      return NextResponse.json({ ok: true, tipo, status: captura.status, baixado: Boolean(baixa) });
    }

    if (DE_ASSINATURA.has(tipo)) {
      const assinatura = await consultarAssinatura(recursoId);
      return NextResponse.json({ ok: true, tipo, status: assinatura.status });
    }
  } catch (erro) {
    // 5xx faz o PayPal reenviar, que é o comportamento certo quando a falha é
    // nossa (API fora do ar, banco indisponível). 2xx aqui perderia o evento
    // para sempre.
    console.error(`[paypal] falhei ao tratar ${tipo} de ${recursoId}`, erro);
    return NextResponse.json({ erro: "Falha ao consultar o PayPal." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ignorado: true, tipo });
}

/**
 * Guarda o evento para conferência posterior.
 *
 * Webhook sem registro é o tipo de coisa que só se descobre quando o cliente
 * jura que pagou. Falha aqui nunca derruba o tratamento: o registro é para nós,
 * a baixa é para o cliente.
 */
async function registrar(eventoId: string | undefined, tipo: string, recursoId: string | undefined) {
  try {
    await prisma.integrationWebhookEvent.create({
      data: {
        provider: "paypal",
        externalId: eventoId ?? null,
        eventType: tipo || "desconhecido",
        payload: { recursoId: recursoId ?? null },
      },
    });
  } catch (erro) {
    console.error("[paypal] não registrei o evento", tipo, erro);
  }
}
