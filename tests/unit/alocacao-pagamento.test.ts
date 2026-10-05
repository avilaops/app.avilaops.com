import { beforeEach, describe, expect, it, vi } from "vitest";
import { centavosAAlocar } from "@/lib/alocacao-pagamento";

/**
 * Quanto do pagamento abate a fatura no ledger, sem banco.
 *
 * O defeito que isto cobre: a baixa alocava o valor CHEIO da fatura. Com
 * alocação parcial anterior, o gatilho `core.guard_allocation` rejeitava
 * ("invoice overpaid"), o erro era engolido e o pagamento ficava em
 * `core.payments` sem alocação — dinheiro recebido que a tesouraria não via
 * abatendo nada.
 */

describe("centavosAAlocar", () => {
  it("sem alocação anterior, aloca o principal da cobrança", () => {
    expect(centavosAAlocar({ amount: 100, interestAmount: 0 }, 100, 0)).toBe(10000);
    expect(centavosAAlocar({ amount: 100 }, 100, null)).toBe(10000);
  });

  it("com alocação parcial anterior, aloca só o saldo", () => {
    expect(centavosAAlocar({ amount: 100, interestAmount: 0 }, 100, 60)).toBe(4000);
  });

  it("saldo zero não aloca nada, e saldo estourado não fica negativo", () => {
    expect(centavosAAlocar({ amount: 100, interestAmount: 0 }, 100, 100)).toBe(0);
    expect(centavosAAlocar({ amount: 100, interestAmount: 0 }, 100, 130)).toBe(0);
  });

  it("juros do cartão parcelado não abate a fatura", () => {
    // Capturou 112,40; 12,40 é juros do pagador.
    expect(centavosAAlocar({ amount: 112.4, interestAmount: 12.4 }, 100, 0)).toBe(10000);
    expect(centavosAAlocar({ amount: 112.4, interestAmount: 12.4 }, 100, 60)).toBe(4000);
  });

  it("cobrança menor que o saldo aloca o principal, não o saldo", () => {
    expect(centavosAAlocar({ amount: 40, interestAmount: 0 }, 100, 0)).toBe(4000);
  });

  it("faz a conta em centavos e aceita Decimal do Prisma", () => {
    const decimal = (v: string) => ({ toString: () => v });
    expect(centavosAAlocar({ amount: decimal("100.00"), interestAmount: decimal("0.00") }, decimal("100.00"), decimal("60.10"))).toBe(3990);
  });
});

/**
 * O caminho inteiro da baixa, com o Prisma simulado: o que chega a
 * `core.payment_allocations` depois de um pagamento confirmado.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    cobranca: null as null | Record<string, unknown>,
    jaAlocado: null as null | number,
    filtroDoSaldo: null as null | Record<string, unknown>,
    alocacoes: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionCharge: {
      findFirst: async () => estado.cobranca,
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    subscriptionInvoice: { update: async ({ data }: { data: Record<string, unknown> }) => data },
    corePayment: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: "pagamento-1", ...create }),
    },
    corePaymentAllocation: {
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        estado.filtroDoSaldo = where;
        return { _sum: { amount: estado.jaAlocado } };
      },
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        estado.alocacoes.push(create);
        return create;
      },
    },
  },
}));

const { baixarCobrancaPorIdExterno } = await import("@/lib/assinaturas");

function cobranca(extra: Record<string, unknown> = {}) {
  return {
    id: "cobranca-1",
    invoiceId: "fatura-1",
    provider: "MERCADOPAGO",
    externalId: "mp-123",
    status: "PENDING",
    paidAt: null,
    amount: 100,
    interestAmount: 0,
    invoice: {
      id: "fatura-1",
      status: "OPEN",
      paidAt: null,
      amount: 100,
      subscription: { organizationId: "org-1", currency: "BRL" },
    },
    ...extra,
  };
}

beforeEach(() => {
  estado.cobranca = cobranca();
  estado.jaAlocado = null;
  estado.filtroDoSaldo = null;
  estado.alocacoes = [];
});

describe("baixarCobrancaPorIdExterno — alocação no ledger", () => {
  it("sem alocação anterior, aloca o principal na fatura", async () => {
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.alocacoes).toEqual([{ paymentId: "pagamento-1", invoiceId: "fatura-1", amount: 100 }]);
  });

  it("com R$ 60 já alocados, aloca os R$ 40 que faltam, e não a fatura cheia", async () => {
    estado.jaAlocado = 60;

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.alocacoes).toEqual([{ paymentId: "pagamento-1", invoiceId: "fatura-1", amount: 40 }]);
  });

  it("fatura já coberta: não aloca e a baixa não falha", async () => {
    estado.jaAlocado = 100;

    const resultado = await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(resultado).not.toBeNull();
    expect(estado.alocacoes).toEqual([]);
  });

  it("o saldo conta só os OUTROS pagamentos confirmados da fatura", async () => {
    // Reprocessar o mesmo evento não pode tratar a alocação deste pagamento
    // como saldo consumido, nem pagamento reembolsado como dinheiro na fatura.
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.filtroDoSaldo).toEqual({
      invoiceId: "fatura-1",
      paymentId: { not: "pagamento-1" },
      payment: { status: "CONFIRMED" },
    });
  });

  it("cartão parcelado com juros aloca o principal", async () => {
    estado.cobranca = cobranca({ amount: 112.4, interestAmount: 12.4 });

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.alocacoes[0]?.amount).toBe(100);
  });
});
