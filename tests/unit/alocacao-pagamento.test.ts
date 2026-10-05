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
    travasDaAuditoria: [] as string[],
    limites: [] as unknown[],
    auditoria: [] as Record<string, unknown>[],
    auditoriaFalha: false,
    /** A leitura fora de transação (a conferência da falha anterior) falha. */
    conferenciaFalha: false,
    alocacaoFalha: null as null | Error,
    /** Marcar o pagamento como reembolsado em core.payments falha. */
    reembolsoFalha: null as null | Error,
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
  const operationsAuditEvent = {
    // O id é a posição na trilha: o banco numera em sequência.
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const posicao = estado.auditoria.findIndex((e) => e.action === where.action && e.entityId === where.entityId);
      return posicao < 0 ? null : { id: BigInt(posicao + 70), metadata: estado.auditoria[posicao].metadata };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (estado.auditoriaFalha) throw new Error("banco de auditoria fora do ar");
      estado.auditoria.push(data);
      return data;
    },
  };
  // As transações: a da alocação registra a trava pedida na fatura; a da
  // auditoria, a trava consultiva da chave do evento.
  const tx = {
    corePaymentAllocation,
    operationsAuditEvent,
    $executeRaw: async (sql: TemplateStringsArray, ...valores: unknown[]) => {
      estado.travasDaAuditoria.push(`${sql.join("?").replace(/\s+/g, " ").trim()} <- ${valores.join(",")}`);
      return 1;
    },
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
        updateMany: async () => {
          if (estado.reembolsoFalha) throw estado.reembolsoFalha;
          return { count: 1 };
        },
      },
      operationsAuditEvent: {
        ...operationsAuditEvent,
        findFirst: async (args: { where: Record<string, unknown> }) => {
          if (estado.conferenciaFalha) throw new Error("conexão caiu");
          return operationsAuditEvent.findFirst(args);
        },
      },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>, limites?: unknown) => {
        estado.limites.push(limites);
        return fn(tx);
      },
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
  estado.travasDaAuditoria = [];
  estado.limites = [];
  estado.auditoria = [];
  estado.auditoriaFalha = false;
  estado.conferenciaFalha = false;
  estado.alocacaoFalha = null;
  estado.reembolsoFalha = null;
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

  it("a transação da alocação tem limite explícito, maior que o padrão do Prisma (2 s e 5 s)", async () => {
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.limites).toEqual([{ maxWait: 5_000, timeout: 10_000 }]);
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
      metadata: {
        invoiceId: "fatura-1",
        status: "approved",
        operacao: "PAGAMENTO",
        erro: "core: allocation organization/currency/status mismatch",
      },
    });
  });

  it("a auditoria procura e grava sob trava consultiva da chave do evento, com limite explícito", async () => {
    estado.jaAlocado = 100;

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.travasDaAuditoria).toEqual([
      "SELECT pg_advisory_xact_lock(hashtextextended(?, 0)) <- audit_events:PAGAMENTO_SEM_ALOCACAO:CorePayment:pagamento-1",
    ]);
    // A da alocação e a da auditoria.
    expect(estado.limites).toEqual([
      { maxWait: 5_000, timeout: 10_000 },
      { maxWait: 5_000, timeout: 10_000 },
    ]);
  });
});

/**
 * A falha do ledger que o reenvio do gateway resolveu. O evento da falha fica
 * na trilha para sempre; sem a marca de resolvida, quem concilia teria de
 * conferir `core.payments` antes de agir sobre ele.
 */
describe("baixarCobrancaPorIdExterno — falha de ledger resolvida no reenvio", () => {
  const ACOES = () => estado.auditoria.map((e) => e.action);

  it("o reenvio que grava e aloca acrescenta PAGAMENTO_LEDGER_RESOLVIDO, sem tocar no evento da falha", async () => {
    estado.alocacaoFalha = new Error("core: allocation organization/currency/status mismatch");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await baixarCobrancaPorIdExterno("mp-123", "approved");
    const falha = { ...estado.auditoria[0] };

    // O gateway reenvia e desta vez o ledger aceita.
    estado.alocacaoFalha = null;
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU", "PAGAMENTO_LEDGER_RESOLVIDO"]);
    expect(estado.auditoria[0]).toEqual(falha);
    expect(estado.auditoria[1]).toMatchObject({
      action: "PAGAMENTO_LEDGER_RESOLVIDO",
      // A mesma entidade da falha, para as duas aparecerem juntas.
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      organizationId: "org-1",
      metadata: {
        falhaEventoId: "70",
        chargeId: "cobranca-1",
        invoiceId: "fatura-1",
        paymentId: "pagamento-1",
        principalCentavos: 10000,
        alocadoCentavos: 10000,
      },
    });
    expect(estado.alocacoes).toEqual([{ paymentId: "pagamento-1", invoiceId: "fatura-1", amount: 100 }]);
  });

  it("mais reenvios depois de resolvida não repetem a resolução", async () => {
    estado.alocacaoFalha = new Error("core: invoice overpaid");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await baixarCobrancaPorIdExterno("mp-123", "approved");
    estado.alocacaoFalha = null;

    await baixarCobrancaPorIdExterno("mp-123", "approved");
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU", "PAGAMENTO_LEDGER_RESOLVIDO"]);
  });

  it("pagamento que nunca falhou não ganha evento de resolução", async () => {
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(estado.auditoria).toEqual([]);
  });

  it("reenvio que falha de novo não vira resolvido", async () => {
    estado.alocacaoFalha = new Error("core: invoice overpaid");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await baixarCobrancaPorIdExterno("mp-123", "approved");
    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU"]);
  });

  it("não conseguir conferir a falha anterior não derruba a baixa nem grava falha nova", async () => {
    estado.conferenciaFalha = true;
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultado = await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(resultado).not.toBeNull();
    expect(estado.alocacoes).toHaveLength(1);
    expect(estado.auditoria).toEqual([]);
    expect(erroNoLog).toHaveBeenCalledTimes(1);
    expect(erroNoLog.mock.calls[0][0]).toContain("não consegui conferir se havia PAGAMENTO_LEDGER_FALHOU de cobranca-1");
  });

  it("falha no reembolso + aviso de pago posterior não grava resolução", async () => {
    // A corrida: o aviso de pago foi consultado no gateway antes do reembolso
    // e só é processado depois de o reembolso falhar no ledger. O pagamento
    // segue CONFIRMED em core.payments, então a baixa chega até a conferência.
    estado.reembolsoFalha = new Error("conexão caiu");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await baixarCobrancaPorIdExterno("mp-123", "refunded");
    estado.reembolsoFalha = null;

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU"]);
    expect(estado.auditoria[0]).toMatchObject({
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      metadata: { status: "refunded", operacao: "REEMBOLSO", erro: "conexão caiu" },
    });
  });

  it("o reenvio do reembolso que dá certo também não grava resolução", async () => {
    estado.reembolsoFalha = new Error("conexão caiu");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await baixarCobrancaPorIdExterno("mp-123", "refunded");
    estado.reembolsoFalha = null;

    await baixarCobrancaPorIdExterno("mp-123", "refunded");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU"]);
  });

  it("falha de reembolso gravada antes de existir `operacao` é reconhecida pelo status", async () => {
    estado.auditoria.push({
      action: "PAGAMENTO_LEDGER_FALHOU",
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      metadata: { chargeId: "cobranca-1", status: "charged_back", erro: "conexão caiu" },
    });

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU"]);
  });

  it("falha de pagamento gravada antes de existir `operacao` continua sendo fechada", async () => {
    estado.auditoria.push({
      action: "PAGAMENTO_LEDGER_FALHOU",
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      metadata: { chargeId: "cobranca-1", status: "approved", erro: "core: invoice overpaid" },
    });

    await baixarCobrancaPorIdExterno("mp-123", "approved");

    expect(ACOES()).toEqual(["PAGAMENTO_LEDGER_FALHOU", "PAGAMENTO_LEDGER_RESOLVIDO"]);
  });
});
