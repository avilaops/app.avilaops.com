import { NextRequest, NextResponse } from "next/server";
import { baixarCobrancaPorIdExterno } from "@/lib/assinaturas";
import { concluirEvento, registrarEvento } from "@/lib/eventos-webhook";
import { assinaturaConfere, consultarAssinatura, consultarCaptura, EVENTOS_DE_PAGAMENTO, paypalConfigurado } from "@/lib/paypal";

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

/**
 * Eventos que mexem em dinheiro. O resto é registrado e ignorado. A lista mora
 * em paypal.ts porque o diagnóstico exige que o webhook assine cada um deles.
 */
const DE_PAGAMENTO = new Set<string>(EVENTOS_DE_PAGAMENTO);

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

  const registro = await registrarEvento({
    provider: "paypal",
    externalId: evento.id ?? null,
    eventType: tipo || "desconhecido",
    payload: { recursoId: recursoId ?? null },
  });

  if (!recursoId) {
    await concluirEvento(registro, "IGNORED");
    return NextResponse.json({ ok: true, ignorado: true });
  }

  try {
    if (DE_PAGAMENTO.has(tipo)) {
      // A API é a fonte: o status que veio no aviso não decide nada.
      const captura = await consultarCaptura(recursoId);
      // create_time da captura é o instante do pagamento; o do webhook pode
      // ser horas depois, quando o PayPal reenvia após uma queda nossa.
      const pagoEm = captura.create_time ? new Date(captura.create_time) : null;
      const baixa = await baixarCobrancaPorIdExterno(
        recursoId,
        captura.status,
        pagoEm && !Number.isNaN(pagoEm.getTime()) ? pagoEm : null,
      );
      await concluirEvento(registro, baixa ? "PROCESSED" : "IGNORED", baixa ? null : "Captura sem cobrança nossa.");
      return NextResponse.json({ ok: true, tipo, status: captura.status, baixado: Boolean(baixa) });
    }

    if (DE_ASSINATURA.has(tipo)) {
      const assinatura = await consultarAssinatura(recursoId);
      await concluirEvento(registro, "PROCESSED");
      return NextResponse.json({ ok: true, tipo, status: assinatura.status });
    }
  } catch (erro) {
    // 5xx faz o PayPal reenviar, que é o comportamento certo quando a falha é
    // nossa (API fora do ar, banco indisponível). 2xx aqui perderia o evento
    // para sempre.
    console.error(`[paypal] falhei ao tratar ${tipo} de ${recursoId}`, erro);
    await concluirEvento(registro, "FAILED", erro instanceof Error ? erro.message : "Falha ao consultar o PayPal.");
    return NextResponse.json({ erro: "Falha ao consultar o PayPal." }, { status: 502 });
  }

  await concluirEvento(registro, "IGNORED");
  return NextResponse.json({ ok: true, ignorado: true, tipo });
}
