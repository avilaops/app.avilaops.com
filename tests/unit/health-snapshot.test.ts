import { describe, expect, it } from "vitest";
import { MONITORED_SERVICES } from "@/lib/health/config";
import { assertSnapshot, sanitize, serverIngestSchema, snapshotSchema } from "@/lib/health/schemas";
import { buildSnapshot, type CheckRow, type ServerRow } from "@/lib/health/snapshot";

const NOW = Date.parse("2026-09-16T15:32:10.000Z");
const ago = (s: number) => new Date(NOW - s * 1000);

const meta = {
  requestId: "req-test-123",
  endpoint: "GET /api/monitoring/live",
  generatedAt: new Date(NOW).toISOString(),
  durationMs: 12,
  collection: { mode: "read-only" as const, lastRoundAt: ago(3).toISOString(), note: "teste" },
  backend: { commit: "abc", builtAt: "x", rulesVersion: "health-v2", probeVersion: "probe-v2" },
};

function check(key: string, over: Partial<CheckRow> = {}): CheckRow {
  const svc = MONITORED_SERVICES.find((s) => s.key === key)!;
  return {
    id: BigInt(1), serviceKey: key, url: svc.url, status: "HEALTHY", statusCode: 200, latencyMs: 80, errorCode: null,
    checkedAt: ago(3), requestId: "req-collect-1", trigger: "timer", probeServer: "apps-client", probeVersion: "probe-v2",
    method: "GET", finalUrl: svc.url, redirects: 0, resolvedIp: "178.105.82.48", dnsMs: 2, connectMs: 1, tlsMs: 10, ttfbMs: 60,
    errorCategory: null, errorMessage: null, finishedAt: ago(2.9), persistedAt: ago(2.8), ...over,
  };
}

const server: ServerRow = {
  id: BigInt(77), serverKey: "apps-client", serverName: "Aplicacoes principais",
  cpuPercent: 38, memoryUsedPercent: 77.2, memoryAvailableMb: 864, swapUsedPercent: 80, diskUsedPercent: 71, load1: 1.2,
  containersRunning: 25, containersUnhealthy: 0, containersTotal: 27, containersStopped: 2,
  observedAt: ago(4), collectedAt: ago(4), receivedAt: ago(3.7), persistedAt: ago(3.6),
  requestId: "host-apps-client-1", collectorVersion: "avila-server-health/2", hostname: "ubuntu-4gb-nbg1-1", sourceIp: "178.105.82.48",
  raw: { mem_total_kb: 3_900_000, mem_available_kb: 884_736, cpu_idle: 62 },
};

describe("snapshot com proveniência", () => {
  const snapshot = buildSnapshot({
    checks: [check("app-avila"), check("fenix", { status: "DOWN", statusCode: null, latencyMs: 494, errorCode: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", errorCategory: "TLS", errorMessage: "unable to verify the first certificate", resolvedIp: "191.252.51.32" })],
    serverRows: [server],
    nowMs: NOW,
    meta,
  });

  it("passa no contrato Zod", () => {
    expect(() => snapshotSchema.parse(snapshot)).not.toThrow();
  });

  it("preserva a hora da coleta original do host", () => {
    const s = snapshot.servers[0];
    expect(s.memory.observedAt).toBe(ago(4).toISOString());
    expect(s.memory.receivedAt).toBe(ago(3.7).toISOString());
    expect(s.memory.persistedAt).toBe(ago(3.6).toISOString());
    expect(s.memory.reliability).toMatchObject({ state: "live", stale: false, ageMs: 4000 });
  });

  it("leva origem, fórmula e dado bruto até a tela", () => {
    const m = snapshot.servers[0].memory;
    expect(m.source).toMatchObject({ type: "host-agent", server: "applications", host: "178.105.82.48", collector: "avila-server-health" });
    expect(m.calculation.formula).toBe("(MemTotal − MemAvailable) / MemTotal × 100");
    expect(m.raw).toMatchObject({ mem_total_kb: 3_900_000, mem_available_kb: 884_736, snapshotId: "77" });
    expect(snapshot.servers[0].containers.stopped.value).toBe(2);
  });

  it("erro técnico chega sem tradução e o IP mostra hospedagem externa", () => {
    const fenix = snapshot.services.find((s) => s.key === "fenix")!;
    expect(fenix.check.errorCode).toBe("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
    expect(fenix.check.errorCategory).toBe("TLS");
    expect(fenix.check.hosting.kind).toBe("external");
    expect(fenix.latency.calculation.formula).toContain("NÃO é tempo de resposta");
  });

  it("serviço sem check aparece como missing, não como saudável", () => {
    const notas = snapshot.services.find((s) => s.key === "notas")!;
    expect(notas.status.value).toBe("UNKNOWN");
    expect(notas.status.reliability.state).toBe("missing");
    expect(snapshot.summary.unknown.value).toBe(MONITORED_SERVICES.length - 2);
    expect(snapshot.summary.down.value).toBe(1);
    expect(snapshot.summary.averageLatency.value).toBe(80);
  });

  it("coletor v1 (sem observedAt) fica estimado e sem containers parados comprovados", () => {
    const legacy = buildSnapshot({
      checks: [],
      serverRows: [{ ...server, observedAt: null, containersTotal: null, containersStopped: null, collectorVersion: null, raw: null }],
      nowMs: NOW,
      meta,
    });
    const s = legacy.servers[0];
    expect(s.cpu.observedAt).toBeNull();
    expect(s.cpu.reliability.state).toBe("estimated");
    expect(s.containers.stopped.value).toBeNull();
    expect(s.containers.stopped.reliability.state).toBe("missing");
    expect(s.containers.stopped.reliability.note).toContain("SEM FONTE COMPROVADA");
  });

  it("leitura antiga do host vira stale", () => {
    const old = buildSnapshot({ checks: [], serverRows: [{ ...server, observedAt: ago(300) }], nowMs: NOW, meta });
    expect(old.servers[0].cpu.reliability).toMatchObject({ state: "stale", stale: true });
  });
});

describe("mock não entra calado em produção", () => {
  const base = buildSnapshot({ checks: [check("app-avila")], serverRows: [server], nowMs: NOW, meta });

  it("aceita em desenvolvimento, recusa em produção", () => {
    const mocked = structuredClone(base);
    mocked.servers[0].cpu.reliability.state = "mock";
    expect(() => assertSnapshot(mocked, "development")).not.toThrow();
    expect(() => assertSnapshot(mocked, "production")).toThrow(/simulada em produção/);
  });

  it("medição sem origem ou sem horário não passa no contrato", () => {
    const broken = structuredClone(base) as unknown as { summary: { healthy: Record<string, unknown> } };
    delete broken.summary.healthy.source;
    expect(() => snapshotSchema.parse(broken)).toThrow();
    const noTime = structuredClone(base) as unknown as { summary: { healthy: Record<string, unknown> } };
    delete noTime.summary.healthy.observedAt;
    expect(() => snapshotSchema.parse(noTime)).toThrow();
  });
});

describe("ingestão e sanitização", () => {
  it("aceita o coletor v1 e o v2", () => {
    const v1 = { serverKey: "apps-client", serverName: "A", cpuPercent: 1, memoryUsedPercent: 2, memoryAvailableMb: 3, swapUsedPercent: 0, diskUsedPercent: 4, load1: 0.1, containersRunning: 5, containersUnhealthy: 0 };
    expect(serverIngestSchema.safeParse(v1).success).toBe(true);
    expect(serverIngestSchema.safeParse({ ...v1, observedAt: "2026-09-16T15:32:05.123Z", containersTotal: 6, containersStopped: 1 }).success).toBe(true);
    expect(serverIngestSchema.safeParse({ ...v1, cpuPercent: 140 }).success).toBe(false);
  });

  it("remove segredos do JSON de inspeção", () => {
    expect(sanitize({ a: 1, token: "x", nested: { Authorization: "Bearer y", ok: "Bearer z" } })).toEqual({
      a: 1, token: "[removido]", nested: { Authorization: "[removido]", ok: "[removido]" },
    });
  });
});
