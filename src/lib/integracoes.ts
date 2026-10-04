import type { EventoWhatsapp } from "@/components/whatsapp/EventosRecentes";
import { prisma } from "@/lib/prisma";

/**
 * Dados do painel de integrações: os eventos que cada provedor gravou e o
 * resumo dos recebíveis. Só leitura — a tela mostra o que já existe, sem
 * inventar número (regra da casa: todo número abre a evidência).
 */

/** Últimos eventos de um provedor em integration_webhook_events. */
export async function eventosDoProvedor(provider: string, limite = 20): Promise<EventoWhatsapp[]> {
  const linhas = await prisma.integrationWebhookEvent.findMany({
    where: { provider },
    orderBy: { receivedAt: "desc" },
    take: limite,
  });
  return linhas.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    status: e.status,
    receivedAt: e.receivedAt.toISOString(),
    processedAt: e.processedAt?.toISOString() ?? null,
    idempotencyKey: e.idempotencyKey ?? null,
    externalId: e.externalId ?? null,
    error: e.error ?? null,
    payload: e.payload,
  }));
}

export type LinhaRecebivel = { status: string; quantidade: number; total: number };

/** Resumo dos recebíveis pela view core.receivables, agrupado por situação. */
export async function resumoRecebiveis(): Promise<LinhaRecebivel[]> {
  const linhas = await prisma.$queryRaw<{ effective_status: string; quantidade: bigint; total: unknown }[]>`
    SELECT effective_status, count(*) AS quantidade, COALESCE(sum(amount), 0) AS total
    FROM core.receivables
    GROUP BY effective_status
    ORDER BY effective_status`;
  return linhas.map((l) => ({
    status: l.effective_status,
    quantidade: Number(l.quantidade),
    total: Number(l.total),
  }));
}
