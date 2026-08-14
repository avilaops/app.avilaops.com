import { prisma } from "@/lib/prisma";

const INTERNAL_ORGANIZATION_ID = "avila-ops-internal";

export type AiCoreStatus = {
  credentialConfigured: boolean;
  lastValidation: {
    outcome: string;
    createdAt: Date;
    latencyMs: number;
    estimatedCostUsd: number;
  } | null;
  telemetryEventsTotal: number;
};

export async function getAiCoreStatus(): Promise<AiCoreStatus> {
  const [connection, lastValidation, telemetryEventsTotal] = await Promise.all([
    prisma.organizationIntegrationConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId: INTERNAL_ORGANIZATION_ID,
          provider: "openai",
        },
      },
    }),
    prisma.aiCoreTelemetry.findFirst({
      where: { organizationId: INTERNAL_ORGANIZATION_ID },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiCoreTelemetry.count(),
  ]);

  return {
    credentialConfigured: Boolean(connection?.tokenCiphertext && connection.status === "ACTIVE"),
    lastValidation: lastValidation
      ? {
          outcome: lastValidation.outcome,
          createdAt: lastValidation.createdAt,
          latencyMs: lastValidation.latencyMs,
          estimatedCostUsd: Number(lastValidation.estimatedCostUsd),
        }
      : null,
    telemetryEventsTotal,
  };
}
