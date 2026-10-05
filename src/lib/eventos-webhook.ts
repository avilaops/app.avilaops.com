import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Registro dos webhooks de pagamento em `integration_webhook_events`.
 *
 * Webhook sem registro é o tipo de coisa que só se descobre quando o cliente
 * jura que pagou. O registro nasce `RECEIVED` e, ao fim do tratamento, vira
 * `PROCESSED`, `IGNORED` ou `FAILED` com `processedAt` — é isso que o painel de
 * integrações mostra como situação, então um evento parado em RECEIVED quer
 * dizer que o tratamento nem terminou.
 *
 * Falha aqui nunca derruba o tratamento: o registro é para nós, a baixa é para
 * o cliente.
 */

export type SituacaoEvento = "PROCESSED" | "IGNORED" | "FAILED";

export async function registrarEvento(dados: {
  provider: string;
  externalId: string | null;
  eventType: string;
  payload: Prisma.InputJsonValue;
}): Promise<string | null> {
  try {
    const evento = await prisma.integrationWebhookEvent.create({ data: dados, select: { id: true } });
    return evento.id;
  } catch (erro) {
    console.error(`[${dados.provider}] não registrei o evento`, dados.eventType, erro);
    return null;
  }
}

export async function concluirEvento(id: string | null, status: SituacaoEvento, erro: string | null = null) {
  if (!id) return;
  try {
    await prisma.integrationWebhookEvent.update({
      where: { id },
      data: { status, error: erro, processedAt: new Date() },
    });
  } catch (falha) {
    console.error("[webhook] não atualizei a situação do evento", id, falha);
  }
}
