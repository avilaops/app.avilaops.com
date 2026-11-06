import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGithubCiSnapshot } from "@/lib/github-ci";

const previous = {
  url: process.env.EXPERIMENTS_PRIVATE_API_URL,
  token: process.env.EXPERIMENTS_API_TOKEN,
};
afterEach(() => {
  if (previous.url === undefined) delete process.env.EXPERIMENTS_PRIVATE_API_URL;
  else process.env.EXPERIMENTS_PRIVATE_API_URL = previous.url;
  if (previous.token === undefined) delete process.env.EXPERIMENTS_API_TOKEN;
  else process.env.EXPERIMENTS_API_TOKEN = previous.token;
  vi.unstubAllGlobals();
});
const repositories = ["avilaops/ERP-Next","avilaops/app.avilaops.com","avilaops/auth.avilaops.com",
  "avilaops/lojas.avilaops.com","avilaops/crm.avilaops.com","avilaops/TMS","avilaops/cms.avilaops.com"];
const evidence = () => ({
  available: true, collectedAt: new Date().toISOString(), stale: false,
  projects: repositories.map(repository => ({
    repository, available: true, latestRuns: [{
      id: 42250, name: "CI", sourceSha: "a".repeat(40), status: "completed",
      conclusion: "success", url: "https://github.com/avilaops/ERP-Next/actions/runs/42250",
      event: "push", updatedAt: new Date().toISOString(),
    }],
  })),
});
function setup() {
  process.env.EXPERIMENTS_PRIVATE_API_URL = "http://10.10.0.4:3300";
  process.env.EXPERIMENTS_API_TOKEN = "private-token-test";
}
describe("GitHub Actions via Experiments private bridge", () => {
  it("falha fechado quando sem configuração", async () => {
    delete process.env.EXPERIMENTS_API_TOKEN;
    expect(await fetchGithubCiSnapshot()).toEqual({ status: "unconfigured", data: null });
  });
  it("recusa destinos públicos e não chama rede", async () => {
    setup();
    process.env.EXPERIMENTS_PRIVATE_API_URL = "https://evil.example";
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    expect(await fetchGithubCiSnapshot()).toEqual({ status: "unavailable", data: null });
    expect(mock).not.toHaveBeenCalled();
  });
  it("preserva somente conclusões legítimas e usa bearer no servidor", async () => {
    setup();
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => evidence() });
    vi.stubGlobal("fetch", mock);
    const snapshot = await fetchGithubCiSnapshot();
    expect(snapshot.status).toBe("ok");
    expect(snapshot.data?.projects?.length).toBe(7);
    expect(snapshot.data?.projects?.[0]?.latestRuns?.[0]?.sourceSha).toBe("a".repeat(40));
    expect(mock).toHaveBeenCalledWith("http://10.10.0.4:3300/api/v1/github-ci",
      expect.objectContaining({ cache: "no-store", redirect: "error" }));
  });
  it("rejeita commits falsos e repositórios repetidos", async () => {
    setup();
    const invalid = evidence();
    invalid.projects[0].latestRuns[0].sourceSha = "invalid";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => invalid }));
    expect(await fetchGithubCiSnapshot()).toEqual({ status: "unavailable", data: null });
  });
});
