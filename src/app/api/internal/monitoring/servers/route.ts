import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { serverIngestSchema } from "@/lib/health/schemas";
import { requestIdFrom } from "@/lib/health/request";
import { logHealth } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

/** Até onde o relógio do host pode divergir do backend antes de a hora dele ser descartada. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export async function POST(request: NextRequest) {
  const receivedAt = new Date();
  const token = process.env.MONITORING_INGEST_TOKEN?.trim();
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const parsed = serverIngestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Métricas inválidas.", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }
  const body = parsed.data;
  const requestId = body.requestId && /^[A-Za-z0-9._:-]{8,80}$/.test(body.requestId) ? body.requestId : requestIdFrom(request.headers);

  // A hora da medição vem do host. Se estiver longe demais do backend (relógio
  // quebrado), não é usada: melhor "estimado" que um "há 2s" falso.
  let observedAt: Date | null = body.observedAt ? new Date(body.observedAt) : null;
  let skewMs: number | null = null;
  if (observedAt) {
    skewMs = receivedAt.getTime() - observedAt.getTime();
    if (Math.abs(skewMs) > MAX_CLOCK_SKEW_MS) observedAt = null;
  }

  const raw = { ...(body.raw ?? {}), clock_skew_ms: skewMs };
  const row = await prisma.serverHealthSnapshot.create({
    data: {
      serverKey: body.serverKey,
      serverName: body.serverName,
      cpuPercent: body.cpuPercent,
      memoryUsedPercent: body.memoryUsedPercent,
      memoryAvailableMb: Math.round(body.memoryAvailableMb),
      swapUsedPercent: body.swapUsedPercent,
      diskUsedPercent: body.diskUsedPercent,
      load1: body.load1,
      containersRunning: body.containersRunning,
      containersUnhealthy: body.containersUnhealthy,
      containersTotal: body.containersTotal ?? null,
      containersStopped: body.containersStopped ?? null,
      collectedAt: observedAt ?? receivedAt,
      observedAt,
      receivedAt,
      requestId,
      collectorVersion: body.collectorVersion ?? null,
      hostname: body.hostname ?? null,
      sourceIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      raw: raw as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  if (skewMs !== null && Math.abs(skewMs) > MAX_CLOCK_SKEW_MS) {
    logHealth("server_clock_skew", { requestId, serverKey: body.serverKey, skewMs });
  }
  return NextResponse.json({ ok: true, id: row.id.toString(), requestId }, { headers: { "x-request-id": requestId } });
}
