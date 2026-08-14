import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Cria duas organizações isoladas para os testes de integração (tenant A e
 * tenant B) e devolve uma função de limpeza. Os dados criados usam prefixo
 * `aicoretest_` para nunca colidir com dados reais e para poderem ser
 * identificados/removidos com segurança mesmo se a limpeza falhar no meio.
 */
export async function setupTestTenants() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const orgA = await prisma.organization.create({
    data: {
      name: `AI Core Test Org A ${suffix}`,
      slug: `aicoretest-org-a-${suffix}`,
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      name: `AI Core Test Org B ${suffix}`,
      slug: `aicoretest-org-b-${suffix}`,
    },
  });

  async function cleanup() {
    await prisma.aiCoreTelemetry.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.aiCoreApproval.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.aiCoreSpendReservation.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.aiCoreSpendPolicy.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.organizationIntegrationConnection.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  }

  return { orgA, orgB, cleanup };
}
