import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function number(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export async function POST(request: NextRequest) {
  const token = process.env.MONITORING_INGEST_TOKEN?.trim();
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const serverKey = typeof body?.serverKey === "string" ? body.serverKey : "";
  const serverName = typeof body?.serverName === "string" ? body.serverName : "";
  const cpuPercent = number(body?.cpuPercent, 0, 100);
  const memoryUsedPercent = number(body?.memoryUsedPercent, 0, 100);
  const memoryAvailableMb = number(body?.memoryAvailableMb, 0, 1_000_000);
  const swapUsedPercent = number(body?.swapUsedPercent, 0, 100);
  const diskUsedPercent = number(body?.diskUsedPercent, 0, 100);
  const load1 = number(body?.load1, 0, 10_000);
  const containersRunning = number(body?.containersRunning, 0, 100_000);
  const containersUnhealthy = number(body?.containersUnhealthy, 0, 100_000);
  if (!serverKey || !serverName || [cpuPercent, memoryUsedPercent, memoryAvailableMb, swapUsedPercent, diskUsedPercent, load1, containersRunning, containersUnhealthy].some((v) => v === null)) {
    return NextResponse.json({ error: "Métricas inválidas." }, { status: 400 });
  }
  await prisma.serverHealthSnapshot.create({ data: {
    serverKey, serverName, cpuPercent: cpuPercent!, memoryUsedPercent: memoryUsedPercent!, memoryAvailableMb: Math.round(memoryAvailableMb!),
    swapUsedPercent: swapUsedPercent!, diskUsedPercent: diskUsedPercent!, load1: load1!, containersRunning: Math.round(containersRunning!),
    containersUnhealthy: Math.round(containersUnhealthy!), collectedAt: new Date(),
  }});
  return NextResponse.json({ ok: true });
}
