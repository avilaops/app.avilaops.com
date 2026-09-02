import { describe, expect, it, vi } from "vitest";

// O módulo importa o Prisma no topo; o teste só olha a regra pura.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mercadopago", () => ({
  listarPagamentosDoPeriodo: vi.fn(),
  mercadoPagoConfigurado: () => true,
}));

const { lancamentoDoPagamento } = await import("@/lib/sync-mercadopago");

describe("o que do Mercado Pago vira linha no extrato", () => {
  it("pagamento aprovado é entrada", () => {
    expect(lancamentoDoPagamento("approved")).toEqual({
      direction: "CREDIT",
      category: "Venda",
    });
  });

  // Sem isto a venda cancelada continuaria somando: o dinheiro voltou para o
  // cliente e o fluxo mostraria a entrada como se tivesse ficado.
  it("estorno e chargeback são saída", () => {
    for (const status of ["refunded", "charged_back"]) {
      expect(lancamentoDoPagamento(status)).toEqual({
        direction: "DEBIT",
        category: "Estorno de venda",
      });
    }
  });

  // Promessa não é dinheiro: pendente ainda pode ser recusado, e lançar no
  // extrato infla o saldo.
  it("pendente, em análise, recusado e cancelado não entram", () => {
    for (const status of ["pending", "in_process", "rejected", "cancelled", "authorized", ""]) {
      expect(lancamentoDoPagamento(status)).toBeNull();
    }
  });

  it("status desconhecido não entra (o padrão é não inventar dinheiro)", () => {
    expect(lancamentoDoPagamento("status_que_o_mp_criar_amanha")).toBeNull();
  });
});
