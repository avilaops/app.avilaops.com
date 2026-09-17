import { describe, expect, it } from "vitest";
import {
  analyzeHistory,
  classifyProbe,
  errorCategory,
  freshness,
  hostingOf,
  summarize,
} from "@/lib/health/classify";
import { SLOW_THRESHOLD_MS, STALE_AFTER_MS } from "@/lib/health/config";

const NOW = Date.parse("2026-09-16T15:32:10.000Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

describe("classificação de um check", () => {
  it("2xx dentro do limite é HEALTHY", () => {
    expect(classifyProbe({ httpStatus: 200, latencyMs: 120, errorCode: null }).status).toBe("HEALTHY");
    expect(classifyProbe({ httpStatus: 204, latencyMs: SLOW_THRESHOLD_MS, errorCode: null }).status).toBe("HEALTHY");
  });

  it("2xx acima do limite é SLOW", () => {
    expect(classifyProbe({ httpStatus: 200, latencyMs: SLOW_THRESHOLD_MS + 1, errorCode: null }).status).toBe("SLOW");
  });

  it("HTTP fora de 2xx é DOWN, mesmo rápido", () => {
    expect(classifyProbe({ httpStatus: 503, latencyMs: 40, errorCode: null })).toEqual({ status: "DOWN", reason: "HTTP 503 fora de 2xx" });
    expect(classifyProbe({ httpStatus: 404, latencyMs: 40, errorCode: null }).status).toBe("DOWN");
  });

  it("erro de rede ou TLS é DOWN e preserva o código original", () => {
    const r = classifyProbe({ httpStatus: null, latencyMs: 494, errorCode: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
    expect(r.status).toBe("DOWN");
    expect(r.reason).toContain("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
  });

  it("timeout é DOWN e categoria TIMEOUT", () => {
    expect(classifyProbe({ httpStatus: null, latencyMs: 8000, errorCode: "TIMEOUT" }).status).toBe("DOWN");
    expect(errorCategory("TIMEOUT")).toBe("TIMEOUT");
  });

  it("categoriza erros sem trocar o código", () => {
    expect(errorCategory("UNABLE_TO_VERIFY_LEAF_SIGNATURE")).toBe("TLS");
    expect(errorCategory("ERR_TLS_CERT_ALTNAME_INVALID")).toBe("TLS");
    expect(errorCategory("ENOTFOUND")).toBe("DNS");
    expect(errorCategory("ECONNREFUSED")).toBe("CONNECTION");
    expect(errorCategory(null, 502)).toBe("HTTP");
    expect(errorCategory(null, 200)).toBeNull();
  });
});

describe("frescor", () => {
  it("usa a hora da medição, não a do fetch", () => {
    expect(freshness(at(2), NOW)).toEqual({ state: "live", ageMs: 2000, staleAfterMs: STALE_AFTER_MS });
  });

  it("detecta dado desatualizado", () => {
    expect(freshness(at(STALE_AFTER_MS / 1000 + 1), NOW).state).toBe("stale");
  });

  it("sem horário é missing, nunca live", () => {
    expect(freshness(null, NOW)).toEqual({ state: "missing", ageMs: null, staleAfterMs: STALE_AFTER_MS });
  });
});

describe("totais do cabeçalho", () => {
  const services = [
    { key: "a", status: "HEALTHY" as const, latencyMs: 100, checkedAt: at(3) },
    { key: "b", status: "HEALTHY" as const, latencyMs: 200, checkedAt: at(3) },
    { key: "c", status: "SLOW" as const, latencyMs: 3000, checkedAt: at(3) },
    { key: "d", status: "DOWN" as const, latencyMs: 494, checkedAt: at(3) },
    { key: "e", status: "DOWN" as const, latencyMs: 8000, checkedAt: at(3) },
    { key: "f", status: "HEALTHY" as const, latencyMs: 50, checkedAt: at(600) },
    { key: "g", status: "HEALTHY" as const, latencyMs: null, checkedAt: null },
  ];
  const summary = summarize(services, NOW);

  it("conta cada serviço em um grupo só, e desatualizado fica fora dos saudáveis", () => {
    expect([summary.healthy, summary.slow, summary.down, summary.unknown]).toEqual([2, 1, 2, 2]);
    expect(summary.healthy + summary.slow + summary.down + summary.unknown).toBe(summary.total);
    expect(summary.keys.unknown).toEqual(["f", "g"]);
  });

  it("média simples só de HEALTHY/SLOW atuais; DOWN e timeout ficam fora", () => {
    expect(summary.average.includedKeys).toEqual(["a", "b", "c"]);
    expect(summary.average.valueMs).toBe(Math.round((100 + 200 + 3000) / 3));
    expect(summary.average.excluded.map((e) => e.key)).toEqual(["d", "e", "f", "g"]);
  });

  it("sem serviço elegível a média é null, não zero", () => {
    expect(summarize([{ key: "x", status: "DOWN", latencyMs: 10, checkedAt: at(1) }], NOW).average.valueMs).toBeNull();
  });
});

describe("hospedagem pelo IP resolvido", () => {
  it("reconhece os dois servidores", () => {
    expect(hostingOf("178.105.82.48")).toMatchObject({ kind: "server", serverKey: "apps-client" });
    expect(hostingOf("204.168.249.111")).toMatchObject({ kind: "server", serverKey: "apps-noclient" });
  });
  it("Cloudflare não comprova origem", () => {
    expect(hostingOf("104.21.51.45").kind).toBe("cloudflare");
    expect(hostingOf("2606:4700:3031::6815:332d").kind).toBe("cloudflare");
  });
  it("IP de fora é externo (ex.: Fênix em 191.252.51.32)", () => {
    expect(hostingOf("191.252.51.32").kind).toBe("external");
    expect(hostingOf(null).kind).toBe("unresolved");
  });
});

describe("histórico", () => {
  it("falhas seguidas, última falha e última recuperação", () => {
    const h = analyzeHistory([
      { status: "HEALTHY", checkedAt: at(60) },
      { status: "DOWN", checkedAt: at(45) },
      { status: "HEALTHY", checkedAt: at(30) },
      { status: "DOWN", checkedAt: at(15) },
      { status: "DOWN", checkedAt: at(0) },
    ]);
    expect(h.consecutiveFailures).toBe(2);
    expect(h.failingSince).toBe(at(15));
    expect(h.lastFailureAt).toBe(at(0));
    expect(h.lastRecoveryAt).toBe(at(30));
  });
});
