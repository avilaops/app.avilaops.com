import { Prisma } from "@prisma/client";
import { redactForLogging } from "@avila-ops/ai-core";
import type { TelemetryEvent, TelemetrySink } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";

/**
 * Persiste telemetria de cada chamada ao Core. Mensagens de erro passam por
 * redação de PII antes de gravar — erros de API às vezes ecoam parte do
 * payload da requisição na mensagem, e isso não deve acabar em texto livre
 * no banco de observabilidade.
 */
export class PrismaTelemetrySink implements TelemetrySink {
  async record(event: TelemetryEvent): Promise<void> {
    await prisma.aiCoreTelemetry.create({
      data: {
        organizationId: event.tenant.organizationId,
        projectId: event.tenant.projectId,
        agentId: event.tenant.agentId,
        actorId: event.tenant.actorId ?? null,
        requestId: event.requestId,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        estimatedCostUsd: new Prisma.Decimal(event.estimatedCostUsd),
        latencyMs: event.latencyMs,
        outcome: event.outcome,
        errorMessage: event.errorMessage ? redactForLogging(event.errorMessage).slice(0, 500) : null,
        toolsInvoked: event.toolsInvoked ?? undefined,
        source: event.tenant.source ?? "PRODUCTION",
        createdAt: event.createdAt,
      },
    });
  }
}
