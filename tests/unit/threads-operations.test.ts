import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ organization: vi.fn(), connection: vi.fn(), decrypt: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findFirst: db.organization }, organizationIntegrationConnection: { findUnique: db.connection } } }));
vi.mock("@/lib/credenciais", () => ({ exigirCredencial: async () => "test-credential" }));
vi.mock("@/lib/token-de-conexao", () => ({ cifrarToken: vi.fn(), decifrarToken: db.decrypt }));
import { conferirPermissoesThreads, tokenDaEmpresaThreads, metricasThreads, estadoThreads } from "@/lib/threads";
import { empresaThreadsDoCrm } from "@/lib/threads-consumidores";

beforeEach(() => {
  vi.resetAllMocks();
  db.organization.mockResolvedValue({ id: "company" });
  db.connection.mockResolvedValue({ externalId: "123", status: "ACTIVE", tokenCiphertext: "encrypted", tokenExpiresAt: new Date(Date.now() + 60000), scopes: ["threads_basic"] });
  db.decrypt.mockReturnValue("private-token");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("autorização operacional Threads", () => {
  it.each([{ is_valid: false }, { user_id: "other" }, { expires_at: 1 }, { data_access_expires_at: 1 }])("recusa token inválido, expirado ou de outro usuário: %j", async override => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { is_valid: true, user_id: "123", scopes: ["threads_basic"], ...override } })));
    await expect(conferirPermissoesThreads("token", "123")).rejects.toThrow("inválida");
  });
  it("confere empresa e conta antes de descriptografar", async () => {
    await expect(tokenDaEmpresaThreads("company", "threads_content_publish", "999")).rejects.toThrow("indisponível");
    expect(db.decrypt).not.toHaveBeenCalled();
    db.organization.mockResolvedValue(null);
    await expect(tokenDaEmpresaThreads("archived", "threads_basic")).rejects.toThrow("indisponível");
    expect(db.decrypt).not.toHaveBeenCalled();
  });
  it("não confunde escopos solicitados com concedidos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ data: { is_valid: true, user_id: "123", scopes: ["threads_basic", "unrelated"] } })));
    await expect(tokenDaEmpresaThreads("company", "threads_content_publish")).rejects.toThrow("não concedida");
    expect(await conferirPermissoesThreads("token", "123")).toEqual(["threads_basic"]);
  });
  it("consulta o endpoint de insights da conta e preserva período sem somar métricas", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: { is_valid: true, user_id: "123", scopes: ["threads_basic", "threads_manage_insights"] } }))
      .mockResolvedValueOnce(Response.json({ data: [{ name: "views", period: "day", values: [{ value: 10 }, { value: 12 }] }, { name: "likes", period: "lifetime", total_value: { value: 4 } }] }));
    vi.stubGlobal("fetch", fetch);
    const result = await metricasThreads("company");
    expect(new URL(String(fetch.mock.calls[1][0])).pathname).toBe("/v1.0/123/threads_insights");
    expect(result.metrics[0].values.map(v => v.value)).toEqual([10, 12]);
    expect(result.metrics[1]).toMatchObject({ period: "lifetime", total: 4 });
  });
  it("estado retorna apenas metadados sem credenciais", async () => {
    const result = await estadoThreads("company");
    expect(result.capabilities.publish).toBe(false);
    expect(JSON.stringify(result)).not.toContain("encrypted");
    expect(db.decrypt).not.toHaveBeenCalled();
  });
});
describe("consumidor CRM", () => {
  it("exige segredo e mapeamento explícito, recusando tenant e prototype alheios", () => {
    const token = "a".repeat(40);
    vi.stubEnv("CRM_THREADS_API_TOKEN", token);
    vi.stubEnv("CRM_THREADS_TENANT_MAP", JSON.stringify({ tenant: "company" }));
    expect(empresaThreadsDoCrm(`Bearer ${token}`, "tenant")).toBe("company");
    for (const tenant of ["other", "__proto__", "constructor", null]) expect(empresaThreadsDoCrm(`Bearer ${token}`, tenant)).toBeNull();
    expect(empresaThreadsDoCrm("Bearer wrong", "tenant")).toBeNull();
    vi.stubEnv("CRM_THREADS_TENANT_MAP", "invalid");
    expect(empresaThreadsDoCrm(`Bearer ${token}`, "tenant")).toBeNull();
  });
});
