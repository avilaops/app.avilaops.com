import { describe, expect, it, vi } from "vitest";
import { montarPainel } from "@/lib/mercadopago-painel";
import { listarAssinaturas } from "@/lib/mercadopago";

vi.mock("@/lib/mercadopago", () => ({
  mercadoPagoConfigurado: () => true,
  buscarConta: async () => null,
  buscarConfiguracaoWebhook: async () => null,
  listarPagamentos: async () => [],
  listarAssinaturas: vi.fn(),
}));
vi.mock("@/lib/lojas-plataforma", () => ({ listarLojas: async () => [] }));

describe("mensagem de assinatura sem loja", () => {
  it.each(["cancelled", "paused", "pending", "authorized"] as const)("respeita o estado %s sem sugerir cancelamento indiscriminado", async (status) => {
    vi.mocked(listarAssinaturas).mockResolvedValue({ assinaturas: [{
      id: "exemplo", loja: "referencia-antiga", status, motivo: "Exemplo", pagador: null,
      valorCentavos: 1990, criadaEm: "2026-09-01", proximaCobranca: null, linkCadastroCartao: null,
    }], total: 1 });
    const painel = await montarPainel();
    const detalhe = painel.linhas[0].divergencias[0].detalhe;
    expect(detalhe).not.toContain("vale cancelar");
    if (status === "cancelled") {
      expect(detalhe).toContain("Assinatura cancelada");
      expect(detalhe).toContain("não é necessário cancelar novamente");
      expect(painel.receitaMensalCentavos).toBe(0);
    }
    if (status === "authorized") expect(painel.receitaMensalCentavos).toBe(1990);
  });
});
