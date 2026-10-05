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
    travas: [] as string[],
    auditoria: [] as Record<string, unknown>[],
    auditoriaFalha: false,
    alocacaoFalha: null as null | Error,
  },
}));

vi.mock("@/lib/prisma", () => {
  const corePaymentAllocation = {
    aggregate: async ({ where }: { where: Record<string, unknown> }) => {
      estado.filtroDoSaldo = where;
      return { _sum: { amount: estado.jaAlocado } };
    },
    upsert: async ({ create }: { create: Record<string, unknown> }) => {
      if (estado.alocacaoFalha) throw estado.alocacaoFalha;
      estado.alocacoes.push(create);
      return create;
    },
  };
  // A transação da alocação: registra a trava pedida na fatura.
  const tx = {
    corePaymentAllocation,
    $queryRaw: async (sql: TemplateStringsArray, ...valores: unknown[]) => {
      estado.travas.push(`${sql.join("?").replace(/\s+/g, " ").trim()} <- ${valores.join(",")}`);
      return [];
    },
  };
  return {
    prisma: {
      subscriptionCharge: {
        findFirst: async () => estado.cobranca,
        update: async ({ data }: { data: Record<string, unknown> }) => data,
      },
      subscriptionInvoice: { update: async ({ data }: { data: Record<string, unknown> }) => data },
      corePayment: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: "pagamento-1", ...create }),
      },
      operationsAuditEvent: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          estado.auditoria.find((e) => e.action === where.action && e.entityId === where.entityId) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (estado.auditoriaFalha) throw new Error("banco de auditoria fora do ar");
          estado.auditoria.push(data);
          return data;
        },
      },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

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
  estado.travas = [];
  estado.auditoria = [];
  estado.auditoriaFalha = false;
  estado.alocacaoFalha = null;
  vi.restoreAllMocks();
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

  it("trava a fatura antes de ler o saldo, na mesma transação da alocação", async () => {
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.travas).toEqual([
      "SELECT id FROM operations.subscription_invoices WHERE id = ? FOR UPDATE <- fatura-1",
    ]);
  });
});

/**
 * Dinheiro que entrou e não abateu fatura não pode ficar só no log do servidor:
 * a conciliação consulta `operations.audit_events`.
 */
describe("baixarCobrancaPorIdExterno — rastro do pagamento que não abateu a fatura", () => {
  it("pagamento alocado por inteiro não gera evento", async () => {
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.auditoria).toEqual([]);
  });

  it("fatura já coberta: grava PAGAMENTO_SEM_ALOCACAO com o valor que sobrou", async () => {
    estado.jaAlocado = 100;

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.auditoria).toEqual([
      {
        action: "PAGAMENTO_SEM_ALOCACAO",
        entityType: "CorePayment",
        entityId: "pagamento-1",
        organizationId: "org-1",
        metadata: {
          chargeId: "cobranca-1",
          invoiceId: "fatura-1",
          provider: "MERCADOPAGO",
          externalId: "mp-123",
          principalCentavos: 10000,
          alocadoCentavos: 0,
          excedenteCentavos: 10000,
        },
      },
    ]);
  });

  it("pagamento maior que o saldo: aloca o saldo e registra o excedente", async () => {
    estado.jaAlocado = 60;

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.alocacoes[0]?.amount).toBe(40);
    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({
      action: "PAGAMENTO_ALOCADO_EM_PARTE",
      entityId: "pagamento-1",
      metadata: { principalCentavos: 10000, alocadoCentavos: 4000, excedenteCentavos: 6000 },
    });
  });

  it("notificação reenviada não duplica o evento", async () => {
    estado.jaAlocado = 100;

    await baixarCobrancaPorIdExterno("mp-123", "approved");
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.auditoria).toHaveLength(1);
  });

  it("falha ao gravar a auditoria não passa em silêncio nem derruba a baixa", async () => {
    estado.jaAlocado = 100;
    estado.auditoriaFalha = true;
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultado = await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(resultado).not.toBeNull();
    expect(erroNoLog).toHaveBeenCalledTimes(1);
    expect(erroNoLog.mock.calls[0][0]).toContain("SEM RASTRO");
    expect(erroNoLog.mock.calls[0][0]).toContain("PAGAMENTO_SEM_ALOCACAO de CorePayment pagamento-1");
    // O valor vai junto, para dar para reconstituir pelo log.
    expect(erroNoLog.mock.calls[0][1]).toMatchObject({ excedenteCentavos: 10000 });
  });

  it("ledger recusando a alocação: a baixa vale e fica PAGAMENTO_LEDGER_FALHOU", async () => {
    // Ex.: pagamento de fatura cancelada, que o gatilho core.guard_allocation rejeita.
    estado.alocacaoFalha = new Error("core: allocation organization/currency/status mismatch");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultado = await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(resultado).not.toBeNull();
    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({
      action: "PAGAMENTO_LEDGER_FALHOU",
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      organizationId: "org-1",
      metadata: { invoiceId: "fatura-1", status: "approved", erro: "core: allocation organization/currency/status mismatch" },
    });
  });
});
