import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseOverview } from "@/lib/mlops-releases";

const originalUrl = process.env.EXPERIMENTS_PRIVATE_API_URL;
const originalToken = process.env.EXPERIMENTS_API_TOKEN;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.EXPERIMENTS_PRIVATE_API_URL;
  else process.env.EXPERIMENTS_PRIVATE_API_URL = originalUrl;
  if (originalToken === undefined) delete process.env.EXPERIMENTS_API_TOKEN;
  else process.env.EXPERIMENTS_API_TOKEN = originalToken;
  vi.unstubAllGlobals();
});

describe("MLOps release read-only", () => {
  it("não autoriza acesso sem token", async () => {
    delete process.env.EXPERIMENTS_API_TOKEN;
    expect((await releaseOverview()).status).toBe("unconfigured");
  });
  it("bloqueia destinos externos", async () => {
    process.env.EXPERIMENTS_API_TOKEN = "sample-secret";
    process.env.EXPERIMENTS_PRIVATE_API_URL = "https://example.com";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect((await releaseOverview()).status).toBe("unavailable");
    expect(spy).not.toHaveBeenCalled();
  });
  it("mostra revisão sem atribuir aprovação por CI verde", async () => {
    process.env.EXPERIMENTS_API_TOKEN = "sample-secret";
    process.env.EXPERIMENTS_PRIVATE_API_URL = "http://10.10.0.4:3300";
    const ids = ["ci", "contract", "security", "humanApproval", "deployment", "postDeployHealth"];
    const evidence = {
      schema: "avila-release-assessments/1", stale: false,
      sourceCollectedAt: "2026-11-06T12:00:00Z",
      projects: [{
        repository: "avilaops/ERP-Next",
        sourceSha: "a".repeat(40),
        decision: "review", reason: "Revisão humana pendente.",
        gates: ids.map((id, i) => ({ id, verdict: i === 0 ? "passed" : "unknown", evidence: null })),
      }],
    };
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => evidence });
    vi.stubGlobal("fetch", spy);
    const result = await releaseOverview();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.items[0]?.decision).toBe("review");
      expect(result.items[0]?.gates[3]?.verdict).toBe("unknown");
    }
  });
  it("rejeita aprovação sem evidência", async () => {
    process.env.EXPERIMENTS_API_TOKEN = "sample-secret";
    process.env.EXPERIMENTS_PRIVATE_API_URL = "http://10.10.0.4:3300";
    const ids = ["ci", "contract", "security", "humanApproval", "deployment", "postDeployHealth"];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      schema: "avila-release-assessments/1", stale: false,
      projects: [{
        repository: "avilaops/ERP-Next",
        sourceSha: "a".repeat(40), decision: "approved", reason: "false",
        gates: ids.map(id => ({ id, verdict: "unknown", evidence: null })),
      }],
    }) }));
    expect((await releaseOverview()).status).toBe("unavailable");
  });
});
