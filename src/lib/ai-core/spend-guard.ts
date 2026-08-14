import { Prisma } from "@prisma/client";
import type { SpendGuard, SpendLimitStatus, TenantContext } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";

/**
 * Ciclo completo de reserva de gasto, com garantia transacional em cada
 * etapa via UPDATE condicional no banco — nunca "SELECT saldo; if (ok) UPDATE"
 * em duas queries separadas, que teria race condition entre chamadas
 * concorrentes.
 *
 * reserve(): cria a linha de reserva e incrementa spent_usd da política
 * atomicamente, só quando ainda cabe no limite.
 * confirm(): ajusta spent_usd pela DIFERENÇA entre o custo real e o
 * estimado (pode reduzir o acumulado se a estimativa foi generosa demais).
 * release(): reverte por completo o que foi reservado (chamada falhou antes
 * de haver custo real).
 * releaseStaleReservations(): limpa reservas RESERVED esquecidas (processo
 * morreu entre reservar e confirmar/liberar) — sem isso, uma reserva órfã
 * ocuparia orçamento para sempre.
 *
 * tenant.source === "TEST" (smoke test de deploy, validação manual): a
 * reserva é persistida normalmente para trilha auditável, mas NUNCA
 * incrementa spent_usd da política real — orçamento comercial e testes
 * de infraestrutura são contabilizados separadamente por desenho.
 */
export class PrismaSpendGuard implements SpendGuard {
  async reserve(
    tenant: TenantContext,
    requestId: string,
    estimatedCostUsd: number,
  ): Promise<SpendLimitStatus> {
    const source = tenant.source ?? "PRODUCTION";
    const policy = await this.currentPolicy(tenant);
    if (!policy) {
      // Sem política cadastrada: não bloqueia, mas também não hospeda gasto
      // sem teto — a ausência de policy é tratada como "sem limite definido
      // ainda", não como "gasto ilimitado liberado silenciosamente". Sem
      // policy, também não há reserva persistida (nada para confirmar/liberar).
      return { limitUsd: 0, spentUsd: 0, blocked: false };
    }

    if (policy.blocked) {
      return {
        limitUsd: Number(policy.limitUsd),
        spentUsd: Number(policy.spentUsd),
        blocked: true,
      };
    }

    const cost = new Prisma.Decimal(estimatedCostUsd);

    if (source === "TEST") {
      // Não toca em spent_usd — apenas registra a reserva para auditoria.
      const reservation = await prisma.aiCoreSpendReservation.create({
        data: {
          policyId: policy.id,
          organizationId: tenant.organizationId,
          projectId: tenant.projectId,
          requestId,
          estimatedCostUsd: cost,
          status: "RESERVED",
          source: "TEST",
        },
      });
      return {
        limitUsd: Number(policy.limitUsd),
        spentUsd: Number(policy.spentUsd),
        blocked: false,
        reservationId: reservation.id,
      };
    }

    const result = await prisma.$queryRaw<{ spent_usd: string }[]>`
      UPDATE ai_core.ai_core_spend_policies
      SET spent_usd = spent_usd + ${cost}, updated_at = NOW()
      WHERE id = ${policy.id}
        AND spent_usd + ${cost} <= limit_usd
      RETURNING spent_usd
    `;

    if (result.length === 0) {
      await prisma.aiCoreSpendPolicy.update({
        where: { id: policy.id },
        data: { blocked: true },
      });
      return { limitUsd: Number(policy.limitUsd), spentUsd: Number(policy.spentUsd), blocked: true };
    }

    const reservation = await prisma.aiCoreSpendReservation.create({
      data: {
        policyId: policy.id,
        organizationId: tenant.organizationId,
        projectId: tenant.projectId,
        requestId,
        estimatedCostUsd: cost,
        status: "RESERVED",
        source: "PRODUCTION",
      },
    });

    return {
      limitUsd: Number(policy.limitUsd),
      spentUsd: Number(result[0].spent_usd),
      blocked: false,
      reservationId: reservation.id,
    };
  }

  async confirm(reservationId: string, actualCostUsd: number): Promise<void> {
    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: reservationId },
    });
    // Reserva já resolvida (confirmada/liberada) ou inexistente: idempotente,
    // não faz nada — evita ajuste duplo se confirm() for chamado duas vezes.
    if (!reservation || reservation.status !== "RESERVED") return;

    const actual = new Prisma.Decimal(actualCostUsd);

    if (reservation.source === "TEST") {
      // Reserva de teste nunca tocou spent_usd — só atualiza o próprio registro.
      await prisma.aiCoreSpendReservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED", actualCostUsd: actual, resolvedAt: new Date() },
      });
      return;
    }

    const diff = actual.minus(reservation.estimatedCostUsd);

    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE ai_core.ai_core_spend_policies
        SET spent_usd = GREATEST(spent_usd + ${diff}, 0), updated_at = NOW()
        WHERE id = ${reservation.policyId}
      `,
      prisma.aiCoreSpendReservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED", actualCostUsd: actual, resolvedAt: new Date() },
      }),
    ]);
  }

  async release(reservationId: string): Promise<void> {
    const reservation = await prisma.aiCoreSpendReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation || reservation.status !== "RESERVED") return;

    if (reservation.source === "TEST") {
      await prisma.aiCoreSpendReservation.update({
        where: { id: reservationId },
        data: { status: "RELEASED", resolvedAt: new Date() },
      });
      return;
    }

    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE ai_core.ai_core_spend_policies
        SET spent_usd = GREATEST(spent_usd - ${reservation.estimatedCostUsd}, 0),
            blocked = FALSE,
            updated_at = NOW()
        WHERE id = ${reservation.policyId}
      `,
      prisma.aiCoreSpendReservation.update({
        where: { id: reservationId },
        data: { status: "RELEASED", resolvedAt: new Date() },
      }),
    ]);
  }

  async releaseStaleReservations(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const stale = await prisma.aiCoreSpendReservation.findMany({
      where: { status: "RESERVED", createdAt: { lt: cutoff } },
      select: { id: true },
    });

    for (const { id } of stale) {
      await this.release(id);
    }

    return stale.length;
  }

  private async currentPolicy(tenant: TenantContext) {
    const now = new Date();
    return prisma.aiCoreSpendPolicy.findFirst({
      where: {
        organizationId: tenant.organizationId,
        projectId: tenant.projectId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      orderBy: { periodStart: "desc" },
    });
  }
}
