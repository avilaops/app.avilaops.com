import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ find: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ instagramAccount: { findUnique: db.find }, organizationIntegrationConnection: { upsert: db.save } }) } }));
vi.mock("@/lib/token-de-conexao", () => ({ cifrarToken: () => "encrypted", decifrarToken: () => "token" }));
vi.mock("@/lib/credenciais", () => ({ obterCredencial: vi.fn(async () => null), exigirCredencial: vi.fn(async () => "instagram-app") }));
import { codificarEstadoInstagram, decodificarEstadoInstagram, montarUrlDeLoginInstagram, salvarConexaoInstagram } from "@/lib/instagram";

describe("Instagram login", () => {
  it("recusa mover uma conta já vinculada a outra empresa", async () => {
    db.find.mockResolvedValue({ organizationId: "outra" });
    await expect(salvarConexaoInstagram({ actorId: "pessoa", organizationId: "empresa", accessToken: "token", tokenType: "bearer", tokenExpiresAt: null, escopos: [], perfil: { id: "ig", username: "marca" } })).rejects.toThrow("outra empresa");
    expect(db.save).not.toHaveBeenCalled();
  });
  it("vincula estado à empresa e ao usuário com nonce único", () => {
    const state = codificarEstadoInstagram("empresa", "pessoa");
    expect(decodificarEstadoInstagram(state)).toEqual({ organizationId: "empresa", actorId: "pessoa" });
    expect(state).not.toBe(codificarEstadoInstagram("empresa", "pessoa"));
    expect(decodificarEstadoInstagram("empresa.pessoa.curto")).toBeNull();
    expect(decodificarEstadoInstagram(state + ".extra")).toBeNull();
  });
  it("usa o host, callback e escopos próprios do Instagram", async () => {
    const url = await montarUrlDeLoginInstagram("https://app.avilaops.com", "state");
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.avilaops.com/api/integrations/instagram/oauth/callback");
    expect(url.searchParams.get("scope")).toContain("instagram_business_basic");
    expect(url.searchParams.get("state")).toBe("state");
  });
});
