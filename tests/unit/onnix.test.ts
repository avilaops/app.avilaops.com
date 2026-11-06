import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOnnixSnapshot } from "@/lib/onnix";

const oldUrl = process.env.EXPERIMENTS_PRIVATE_API_URL;
const oldToken = process.env.EXPERIMENTS_API_TOKEN;

afterEach(() => {
  if (oldUrl === undefined) delete process.env.EXPERIMENTS_PRIVATE_API_URL;
  else process.env.EXPERIMENTS_PRIVATE_API_URL = oldUrl;
  if (oldToken === undefined) delete process.env.EXPERIMENTS_API_TOKEN;
  else process.env.EXPERIMENTS_API_TOKEN = oldToken;
  vi.unstubAllGlobals();
});

describe("ONNIX privado", () => {
  it("não inventa medição quando falta credencial", async () => {
    delete process.env.EXPERIMENTS_API_TOKEN;
    expect(await fetchOnnixSnapshot()).toEqual({ status: "unconfigured", evidence: null });
  });

  it("recusa destinos não privados mesmo com token", async () => {
    process.env.EXPERIMENTS_PRIVATE_API_URL = "https://example.com";
    process.env.EXPERIMENTS_API_TOKEN = "segredo";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchOnnixSnapshot()).toEqual({ status: "unavailable", evidence: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it("aceita apenas evidência válida e não envia segredos ao navegador", async () => {
    process.env.EXPERIMENTS_PRIVATE_API_URL = "http://10.10.0.4:3300";
    process.env.EXPERIMENTS_API_TOKEN = "segredo";
    const evidence = {
      available: true, createdAt: new Date().toISOString(), modelSha256: "a".repeat(64),
      evaluation: { verdict: "passed", latencyMs: 805.14 },
    };
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => evidence });
    vi.stubGlobal("fetch", spy);
    expect(await fetchOnnixSnapshot()).toEqual({ status: "ok", evidence });
    expect(spy).toHaveBeenCalledWith("http://10.10.0.4:3300/api/v1/onnix",
      expect.objectContaining({ cache: "no-store", redirect: "error" }));
  });

  it("responde indisponível a JSON inválido", async () => {
    process.env.EXPERIMENTS_PRIVATE_API_URL = "http://10.10.0.4:3300";
    process.env.EXPERIMENTS_API_TOKEN = "segredo";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true, evaluation: { verdict: "passed" } }) }));
    expect(await fetchOnnixSnapshot()).toEqual({ status: "unavailable", evidence: null });
  });
});
