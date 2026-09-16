import { prisma } from "@/lib/prisma";
import { analyzeHistory, classifyProbe, errorCategory } from "@/lib/health/classify";
import {
  HISTORY_WINDOW_MS,
  MIN_REFRESH_MS,
  MONITORED_SERVICES,
  PROBE_ORIGIN,
  PROBE_VERSION,
  RETENTION_MS,
  type MonitoredService,
} from "@/lib/health/config";
import { probeUrl } from "@/lib/health/probe";
import { assertSnapshot, type Snapshot } from "@/lib/health/schemas";
import { buildSnapshot } from "@/lib/health/snapshot";

export { MONITORED_SERVICES };

/** Quem pediu a rodada: o timer do host ou a tela aberta. */
export type CollectTrigger = "timer" | "screen";

/** Log em uma linha JSON, com o requestId para cruzar tela, API e banco. */
export function logHealth(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), scope: "health", event, ...data }));
}

export async function probeService(service: MonitoredService) {
  const result = await probeUrl(service.url);
  const { status } = classifyProbe({ httpStatus: result.httpStatus, latencyMs: result.latencyMs, errorCode: result.errorCode });
  return { service, result, status };
}

export async function collectServices(requestId: string, trigger: CollectTrigger) {
  const started = Date.now();
  const rounds = await Promise.all(MONITORED_SERVICES.map(probeService));
  await prisma.serviceHealthCheck.createMany({
    data: rounds.map(({ service, result, status }) => ({
      serviceKey: service.key,
      serviceName: service.name,
      serverKey: service.server,
      url: service.url,
      status,
      statusCode: result.httpStatus,
      latencyMs: result.latencyMs,
      errorCode: result.errorCode,
      checkedAt: result.startedAt,
      requestId,
      trigger,
      probeServer: PROBE_ORIGIN,
      probeVersion: PROBE_VERSION,
      method: result.method,
      finalUrl: result.finalUrl,
      redirects: result.redirects,
      resolvedIp: result.resolvedIp,
      dnsMs: result.timings.dnsMs,
      connectMs: result.timings.connectMs,
      tlsMs: result.timings.tlsMs,
      ttfbMs: result.timings.ttfbMs,
      errorCategory: errorCategory(result.errorCode, result.httpStatus),
      errorMessage: result.errorMessage?.slice(0, 500) ?? null,
      finishedAt: result.finishedAt,
    })),
  });

  // Retenção de 24 h. A limpeza roda em ~2% das rodadas (a cada ~12 min com o
  // timer de 15 s): apagar a cada rodada custaria um DELETE a cada 15 s.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    await prisma.serviceHealthCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
    await prisma.serverHealthSnapshot.deleteMany({ where: { collectedAt: { lt: cutoff } } });
  }

  logHealth("collect", {
    requestId,
    trigger,
    durationMs: Date.now() - started,
    down: rounds.filter((r) => r.status === "DOWN").map((r) => `${r.service.key}:${r.result.errorCode ?? r.result.httpStatus}`),
  });
  return rounds;
}

// Uma rodada por vez neste processo: duas abas abertas não disparam 40 testes.
let inFlight: Promise<unknown> | null = null;

export async function monitoringSnapshot(options: {
  requestId: string;
  refresh: boolean;
  endpoint: string;
}): Promise<Snapshot> {
  const started = Date.now();
  let mode: Snapshot["meta"]["collection"]["mode"] = "read-only";
  let note = "leitura do banco, sem nova medição";

  if (options.refresh) {
    const last = await prisma.serviceHealthCheck.findFirst({ orderBy: { checkedAt: "desc" }, select: { checkedAt: true } });
    const age = last ? Date.now() - last.checkedAt.getTime() : Infinity;
    if (age < MIN_REFRESH_MS) {
      mode = "reused";
      note = `última rodada tem ${Math.round(age / 1000)} s (< ${MIN_REFRESH_MS / 1000} s): reaproveitada, os horários mostrados são os dela`;
    } else if (inFlight) {
      await inFlight;
      mode = "reused";
      note = "outra requisição já estava medindo: aproveitada a rodada dela";
    } else {
      inFlight = collectServices(options.requestId, "screen").finally(() => {
        inFlight = null;
      });
      await inFlight;
      mode = "collected";
      note = "rodada nova disparada por esta requisição";
    }
  }

  const nowMs = Date.now();
  const since = new Date(nowMs - HISTORY_WINDOW_MS);
  const [checks, serverRows, lastRound] = await Promise.all([
    prisma.serviceHealthCheck.findMany({ where: { checkedAt: { gte: since } }, orderBy: { checkedAt: "asc" } }),
    prisma.serverHealthSnapshot.findMany({ where: { collectedAt: { gte: since } }, orderBy: { collectedAt: "asc" } }),
    prisma.serviceHealthCheck.findFirst({ orderBy: { checkedAt: "desc" }, select: { checkedAt: true } }),
  ]);

  const snapshot = buildSnapshot({
    checks,
    serverRows,
    nowMs,
    meta: {
      requestId: options.requestId,
      endpoint: options.endpoint,
      generatedAt: new Date(nowMs).toISOString(),
      durationMs: Date.now() - started,
      collection: { mode, lastRoundAt: lastRound?.checkedAt.toISOString() ?? null, note },
      backend: {
        commit: process.env.GIT_SHA || "desconhecido",
        builtAt: process.env.BUILT_AT || "desconhecido",
        rulesVersion: "health-v2",
        probeVersion: PROBE_VERSION,
      },
    },
  });
  return assertSnapshot(snapshot);
}

/** Histórico completo retido de um serviço, para o painel de detalhes. */
export async function serviceDetail(key: string) {
  const service = MONITORED_SERVICES.find((s) => s.key === key);
  if (!service) return null;
  const since = new Date(Date.now() - RETENTION_MS);
  const rows = await prisma.serviceHealthCheck.findMany({
    where: { serviceKey: key, checkedAt: { gte: since } },
    orderBy: { checkedAt: "asc" },
    select: { status: true, checkedAt: true },
  });
  const recent = await prisma.serviceHealthCheck.findMany({
    where: { serviceKey: key },
    orderBy: { checkedAt: "desc" },
    take: 20,
  });
  return {
    service,
    retentionMs: RETENTION_MS,
    ...analyzeHistory(rows),
    recentChecks: recent.map((c) => ({
      id: c.id.toString(),
      checkedAt: c.checkedAt.toISOString(),
      finishedAt: c.finishedAt?.toISOString() ?? null,
      persistedAt: c.persistedAt?.toISOString() ?? null,
      status: c.status,
      httpStatus: c.statusCode,
      latencyMs: c.latencyMs,
      errorCode: c.errorCode,
      errorCategory: c.errorCategory ?? errorCategory(c.errorCode, c.statusCode),
      errorMessage: c.errorMessage,
      resolvedIp: c.resolvedIp,
      tlsMs: c.tlsMs,
      dnsMs: c.dnsMs,
      requestId: c.requestId,
      trigger: c.trigger,
      probeVersion: c.probeVersion,
    })),
  };
}
