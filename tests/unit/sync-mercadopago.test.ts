import { describe, expect, it, vi } from "vitest";

// O módulo importa o Prisma no topo; o teste só olha a regra pura.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mercadopago", () => ({
  listarPagamentosDoPeriodo: vi.fn(),
  mercadoPagoConfigurado: () => true,
  usuarioDoToken: vi.fn(),
}));

const { lancamentoDoPagamento, ladoDoPagamento } = await import("@/lib/sync-mercadopago");

describe("o que do Mercado Pago vira linha no extrato", () => {
  it("pagamento aprovado que recebemos é entrada, venda da casa", () => {
    expect(lancamentoDoPagamento("approved")).toEqual({
      direction: "CREDIT",
      category: "Venda",
      scope: "EMPRESA",
    });
  });

  // Sem isto a venda cancelada continuaria somando: o dinheiro voltou para o
  // cliente e o fluxo mostraria a entrada como se tivesse ficado.
  it("estorno e chargeback de venda são saída", () => {
    for (const status of ["refunded", "charged_back"]) {
      expect(lancamentoDoPagamento(status)).toEqual({
        direction: "DEBIT",
        category: "Estorno de venda",
        scope: "EMPRESA",
      });
    }
  });

  // A rota devolve também o que a conta pagou. O fone de R$ 24,90 de
  // 24/10/2025 entraria como "Venda" sem esta regra.
  it("pagamento que fizemos é saída, na fila de triagem", () => {
    expect(lancamentoDoPagamento("approved", "PAGAMOS")).toEqual({
      direction: "DEBIT",
      category: "Compra",
      scope: "INDEFINIDO",
    });
    expect(lancamentoDoPagamento("refunded", "PAGAMOS")).toEqual({
      direction: "CREDIT",
      category: "Estorno de compra",
      scope: "INDEFINIDO",
    });
  });

  // Promessa não é dinheiro: pendente ainda pode ser recusado, e lançar no
  // extrato infla o saldo.
  it("pendente, em análise, recusado e cancelado não entram", () => {
    for (const status of ["pending", "in_process", "rejected", "cancelled", "authorized", ""]) {
      expect(lancamentoDoPagamento(status)).toBeNull();
      expect(lancamentoDoPagamento(status, "PAGAMOS")).toBeNull();
    }
  });

  it("status desconhecido não entra (o padrão é não inventar dinheiro)", () => {
    expect(lancamentoDoPagamento("status_que_o_mp_criar_amanha")).toBeNull();
  });
});

describe("de que lado do pagamento estamos", () => {
  const nos = 2944732714;

  it("collector somos nós: recebemos", () => {
    expect(ladoDoPagamento({ collectorId: nos, payerId: 123 }, nos)).toBe("RECEBEMOS");
  });

  it("payer somos nós e collector é outro: pagamos", () => {
    expect(ladoDoPagamento({ collectorId: 1075958612, payerId: nos }, nos)).toBe("PAGAMOS");
  });

  it("sem id nenhum, vale o padrão antigo: recebimento", () => {
    expect(ladoDoPagamento({ collectorId: null, payerId: null }, nos)).toBe("RECEBEMOS");
  });
});
