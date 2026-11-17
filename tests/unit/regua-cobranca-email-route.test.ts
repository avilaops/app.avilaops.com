import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({ autorizado: vi.fn(), processar: vi.fn() }));
vi.mock("@/lib/service-auth", () => ({ isServiceCall: estado.autorizado }));
vi.mock("@/lib/regua-cobranca-email", () => ({ processarReguaDeCobranca: estado.processar }));

const { POST } = await import("@/app/api/internal/billing/email-reminders/route");

describe("rota interna da régua de cobrança", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa chamada sem credencial de serviço", async () => {
    estado.autorizado.mockReturnValue(false);
    const resposta = await POST(new NextRequest("https://app.avilaops.com/api/internal/billing/email-reminders", { method: "POST" }));
    expect(resposta.status).toBe(401);
    expect(estado.processar).not.toHaveBeenCalled();
  });

  it("processa lote autenticado sem expor destinatários", async () => {
    estado.autorizado.mockReturnValue(true);
    estado.processar.mockResolvedValue({ reconciliados: 3, reivindicados: 1, enviados: 1, repeticoes: 0, falhas: 0, cancelados: 0, ignorados: 0 });
    const resposta = await POST(new NextRequest("https://app.avilaops.com/api/internal/billing/email-reminders", {
      method: "POST",
      headers: { "x-service-key": "teste" },
    }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, reconciliados: 3, reivindicados: 1, enviados: 1, repeticoes: 0, falhas: 0, cancelados: 0, ignorados: 0 });
  });
});
