import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { verifyServiceJwt } from "@/lib/service-auth";
import { prisma } from "@/lib/prisma";
import { PrismaSpendGuard } from "@/lib/ai-core/spend-guard";

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutos
// Chave arbitrária fixa para o advisory lock deste job específico — só
// precisa ser única entre os jobs do sistema, não ter significado.
const CLEANUP_LOCK_KEY = 918_273_645;

/**
 * Libera reservas de gasto RESERVED esquecidas (processo morreu entre
 * reservar e confirmar/liberar) — sem isso, uma reserva órfã ocuparia
 * orçamento para sempre. Acionada por scheduler externo (mesmo padrão de
 * /api/integrations/seo-audit/run) ou manualmente por um admin.
 *
 * pg_try_advisory_lock garante que duas execuções concorrentes (scheduler
 * disparando de novo antes da anterior terminar, ou execução manual +
 * scheduler ao mesmo tempo) não rodem simultaneamente — a segunda desiste
 * imediatamente em vez de duplicar trabalho ou competir pela mesma reserva.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  const service = verifyServiceJwt(request);
  if (!admin && !service) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { maxAgeMs?: unknown };
  const maxAgeMs =
    typeof body.maxAgeMs === "number" && body.maxAgeMs > 0 ? body.maxAgeMs : DEFAULT_MAX_AGE_MS;

  const lockResult = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${CLEANUP_LOCK_KEY}) as locked
  `;
  const acquired = lockResult[0]?.locked ?? false;

  if (!acquired) {
    return NextResponse.json(
      { status: "SKIPPED", reason: "Outra execução do job já está em andamento." },
      { status: 409 },
    );
  }

  const run = await prisma.aiCoreCleanupRun.create({
    data: { maxAgeMs, status: "RUNNING" },
  });

  try {
    const guard = new PrismaSpendGuard();
    const releasedCount = await guard.releaseStaleReservations(maxAgeMs);

    await prisma.aiCoreCleanupRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", releasedCount, finishedAt: new Date() },
    });

    return NextResponse.json({ status: "SUCCESS", runId: run.id, releasedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";

    await prisma.aiCoreCleanupRun.update({
      where: { id: run.id },
      data: { status: "ERROR", errorMessage: message.slice(0, 500), finishedAt: new Date() },
    });

    // Alerta simples via log estruturado — o painel em /implantacao lê a
    // última execução e mostra estado de erro; um agregador de logs externo
    // (se existir) pode disparar notificação a partir desta linha.
    console.error("[ai-core-cleanup] job failed", { runId: run.id, error: message });

    return NextResponse.json({ status: "ERROR", runId: run.id, error: message }, { status: 500 });
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${CLEANUP_LOCK_KEY})`;
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
