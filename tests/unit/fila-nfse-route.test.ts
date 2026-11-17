import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({ autorizado: vi.fn(), processar: vi.fn() }));
vi.mock("@/lib/service-auth", () => ({ isServiceCall: estado.autorizado }));
vi.mock("@/lib/fila-nfse", () => ({ processarFilaNfse: estado.processar }));

const { POST } = await import("@/app/api/internal/billing/nfse/route");

describe("rota interna da fila de NFS-e", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa chamada sem credencial de serviço", async () => {
    estado.autorizado.mockReturnValue(false);
    const resposta = await POST(new NextRequest("https://app.avilaops.com/api/internal/billing/nfse", { method: "POST" }));
    expect(resposta.status).toBe(401);
    expect(estado.processar).not.toHaveBeenCalled();
  });

  it("aceita a chave estática usada pelo n8n", async () => {
    estado.autorizado.mockReturnValue(true);
    estado.processar.mockResolvedValue({ processados: 0, emitidos: 0, falhas: 0 });
    const resposta = await POST(new NextRequest("https://app.avilaops.com/api/internal/billing/nfse", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-key": "teste" },
      body: JSON.stringify({ limit: 7 }),
    }));
    expect(resposta.status).toBe(200);
    expect(estado.processar).toHaveBeenCalledWith(expect.any(Date), 7);
  });
});
