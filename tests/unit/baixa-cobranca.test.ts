import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A baixa da cobrança, com o banco simulado.
 *
 * Existe porque o teste de integração que achou este defeito só roda com
 * Postgres de pé, e o defeito é de REGRA, não de banco: a guarda "cobrança paga
 * não volta atrás" comparava o status com a string "PAID", e o webhook do
 * Mercado Pago grava "approved". Resultado: um "pending" atrasado, entregue
 * depois do "approved", reabria a cobrança com o dinheiro já na conta.
 *
 * Com o Prisma simulado, o caminho é exercitado em qualquer máquina — inclusive
 * nas que não têm Docker.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    cobranca: null as null | Record<string, unknown>,
    fatura: null as null | Record<string, unknown>,
    dadosDaCobranca: null as null | Record<string, unknown>,
    dadosDaFatura: null as null | Record<string, unknown>,
    pagamentos: [] as Record<string, unknown>[],
    alocacoes: [] as Record<string, unknown>[],
    reembolsosNoLedger: 0,
    auditoria: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionCharge: {
      findFirst: async () => estado.cobranca,
      // Outras cobranças pagas da mesma fatura: nenhuma.
      count: async () => 0,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        estado.dadosDaCobranca = data;
        return data;
      },
    },
    subscriptionInvoice: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        estado.dadosDaFatura = data;
        return data;
      },
    },
    // O ledger (core.payments + alocação) que a baixa alimenta. Sem ele o
    // bloco estourava dentro do try e cada teste de "pago" imprimia
    // "[ledger] não registrei..." — passando, mas sem exercitar o ledger.
    corePayment: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const pagamento = { id: "pagamento-1", ...create };
        estado.pagamentos.push(pagamento);
        return pagamento;
      },
      updateMany: async () => {
        estado.reembolsosNoLedger += 1;
        return { count: 1 };
      },
    },
    // A baixa que dá certo confere se havia uma falha de ledger a fechar.
    operationsAuditEvent: { findFirst: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async () => [],
        // A auditoria: trava consultiva, procura e gravação.
        $executeRaw: async () => 1,
        operationsAuditEvent: {
          findFirst: async ({ where }: { where: Record<string, unknown> }) =>
            estado.auditoria.find((e) => e.action === where.action && e.entityId === where.entityId) ?? null,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            estado.auditoria.push(data);
            return data;
          },
        },
        corePaymentAllocation: {
          aggregate: async () => ({ _sum: { amount: null } }),
          upsert: async ({ create }: { create: Record<string, unknown> }) => {
            estado.alocacoes.push(create);
            return create;
          },
        },
      }),
  },
}));

const { baixarCobrancaPorIdExterno } = await import("@/lib/assinaturas");

// Nenhum caminho daqui deve cair no "best-effort" do ledger: se cair, o mock
// ficou para trás de novo e o teste tem de dizer.
const erroNoLog = vi.spyOn(console, "error");

/** O que o ledger lê da fatura: valor, e a assinatura com cliente e moeda. */
const FATURA_NO_LEDGER = { amount: 100, subscription: { organizationId: "org-1", currency: "BRL" } };

/** Uma cobrança aberta, do jeito que o banco a devolve. */
function aberta(extra: Record<string, unknown> = {}) {
  return {
    id: "cobranca-1",
    invoiceId: "fatura-1",
    status: "PENDING",
    provider: "MERCADO_PAGO",
    externalId: "123456789",
    paidAt: null,
    amount: 100,
    interestAmount: 0,
    invoice: { id: "fatura-1", status: "OPEN", paidAt: null, ...FATURA_NO_LEDGER },
    ...extra,
  };
}

beforeEach(() => {
  estado.dadosDaCobranca = null;
  estado.dadosDaFatura = null;
  estado.pagamentos = [];
  estado.alocacoes = [];
  estado.reembolsosNoLedger = 0;
  estado.auditoria = [];
  estado.cobranca = aberta();
  erroNoLog.mockClear();
});

describe("baixarCobrancaPorIdExterno", () => {
  it('grava "PAID" para o "approved" do Mercado Pago, e não o nome cru', async () => {
    // A mesma coluna guardava "PAID" para o Efí e "approved" para o Mercado
    // Pago. Quem consulta por status — a varredura de pendentes do Efí usa
    // `notIn: ["PAID", "CANCELLED"]` — tratava cobrança paga como aberta.
    await baixarCobrancaPorIdExterno("123456789", "approved");

    expect(estado.dadosDaCobranca?.status).toBe("PAID");
    expect(estado.dadosDaCobranca?.paidAt).toBeInstanceOf(Date);
    expect(estado.dadosDaFatura?.status).toBe("PAID");
    // E o dinheiro chega ao ledger, alocado na fatura.
    expect(estado.pagamentos).toHaveLength(1);
    expect(estado.pagamentos[0]).toMatchObject({ organizationId: "org-1", externalId: "123456789", amount: 100, status: "CONFIRMED" });
    expect(estado.alocacoes).toEqual([{ paymentId: "pagamento-1", invoiceId: "fatura-1", amount: 100 }]);
    expect(erroNoLog).not.toHaveBeenCalled();
  });

  it('grava "PAID" para o "PAID" do Efí, como sempre', async () => {
    await baixarCobrancaPorIdExterno("txid-efi", "PAID");

    expect(estado.dadosDaCobranca?.status).toBe("PAID");
    expect(estado.dadosDaFatura?.status).toBe("PAID");
    expect(estado.alocacoes).toHaveLength(1);
    expect(erroNoLog).not.toHaveBeenCalled();
  });

  it("evento fora de ordem NÃO reabre cobrança já paga no Mercado Pago", async () => {
    // O defeito, em uma linha: a cobrança paga tinha status "approved", a
    // guarda comparava com "PAID", e o "pending" atrasado passava.
    const pagoEm = new Date("2026-09-30T12:00:00Z");
    estado.cobranca = aberta({
      status: "approved",
      paidAt: pagoEm,
      invoice: { id: "fatura-1", status: "PAID", paidAt: pagoEm, ...FATURA_NO_LEDGER },
    });

    await baixarCobrancaPorIdExterno("123456789", "pending");

    expect(estado.dadosDaCobranca?.status).toBe("PAID");
    // E a data do pagamento é a do pagamento, não a do reprocessamento.
    expect(estado.dadosDaCobranca?.paidAt).toBe(pagoEm);
  });

  it("registra a recusa, que o cliente precisa ver na tela", async () => {
    await baixarCobrancaPorIdExterno("123456789", "rejected");

    expect(estado.dadosDaCobranca?.status).toBe("rejected");
    expect(estado.dadosDaCobranca?.paidAt).toBeNull();
    // Recusa não mexe na fatura, nem entra no ledger.
    expect(estado.dadosDaFatura).toBeNull();
    expect(estado.pagamentos).toEqual([]);
  });

  it("não reabre cobrança paga nem quando o status vem em branco", async () => {
    estado.cobranca = aberta({ status: "PAID", paidAt: new Date("2026-09-01T00:00:00Z") });

    await baixarCobrancaPorIdExterno("123456789", "");

    expect(estado.dadosDaCobranca?.status).toBe("PAID");
  });

  describe("reembolso é final", () => {
    const pagoEm = new Date("2026-09-30T12:00:00Z");

    /** Reembolsada: o reembolso mantém o `paidAt` e reabre a fatura. */
    function reembolsada(extra: Record<string, unknown> = {}) {
      return aberta({
        status: "REFUNDED",
        paidAt: pagoEm,
        invoice: { id: "fatura-1", status: "OPEN", paidAt: null, ...FATURA_NO_LEDGER },
        ...extra,
      });
    }

    it("o reembolso grava REFUNDED, mantém o paidAt, reabre a fatura e marca o ledger", async () => {
      estado.cobranca = aberta({
        status: "PAID",
        paidAt: pagoEm,
        invoice: { id: "fatura-1", status: "PAID", paidAt: pagoEm, ...FATURA_NO_LEDGER },
      });

      await baixarCobrancaPorIdExterno("123456789", "refunded");

      expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: pagoEm });
      expect(estado.dadosDaFatura).toEqual({ status: "OPEN", paidAt: null });
      expect(estado.reembolsosNoLedger).toBe(1);
      expect(estado.auditoria).toEqual([]);
    });

    it.each([
      ["approved", "MERCADO_PAGO"],
      ["COMPLETED", "PAYPAL"],
    ])('aviso de pago ("%s", %s) depois do reembolso não reabre nada e deixa rastro', async (status, provider) => {
      // A corrida: o aviso foi consultado no gateway antes do reembolso e só é
      // gravado depois. Antes, a cobrança voltava a "PAID" (o `paidAt` ficou) e
      // a fatura reaberta fechava de novo, com o ledger ainda em REFUNDED.
      estado.cobranca = reembolsada({ provider });

      const resultado = await baixarCobrancaPorIdExterno("123456789", status, new Date("2026-10-05T10:00:00Z"));

      expect(resultado).toBe(estado.cobranca);
      expect(estado.dadosDaCobranca).toBeNull();
      expect(estado.dadosDaFatura).toBeNull();
      expect(estado.pagamentos).toEqual([]);
      expect(estado.alocacoes).toEqual([]);
      expect(estado.auditoria).toEqual([
        {
          action: "PAGO_APOS_REEMBOLSO",
          entityType: "SubscriptionCharge",
          entityId: "cobranca-1",
          organizationId: "org-1",
          metadata: { chargeId: "cobranca-1", invoiceId: "fatura-1", provider, externalId: "123456789", status },
        },
      ]);
      expect(erroNoLog).not.toHaveBeenCalled();
    });

    it("o aviso de pago repetido não repete o rastro", async () => {
      estado.cobranca = reembolsada();

      await baixarCobrancaPorIdExterno("123456789", "approved");
      await baixarCobrancaPorIdExterno("123456789", "approved");

      expect(estado.auditoria).toHaveLength(1);
    });

    it.each(["pending", "in_process", "rejected", ""])(
      'aviso "%s" depois do reembolso não leva a cobrança de volta a PAID',
      async (status) => {
        // Não é só o "pago": qualquer status que não fosse de reembolso caía em
        // `jaEstavaPago` e gravava "PAID".
        estado.cobranca = reembolsada();

        await baixarCobrancaPorIdExterno("123456789", status);

        expect(estado.dadosDaCobranca).toBeNull();
        expect(estado.dadosDaFatura).toBeNull();
        expect(estado.pagamentos).toEqual([]);
        expect(estado.auditoria).toEqual([]);
      },
    );

    it.each(["refunded", "charged_back", "REFUNDED"])(
      'o reenvio do reembolso ("%s") passa pela guarda e refaz o ledger',
      async (status) => {
        // É o reenvio que conserta uma falha de ledger no primeiro reembolso.
        estado.cobranca = reembolsada();

        await baixarCobrancaPorIdExterno("123456789", status);

        expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: pagoEm });
        expect(estado.reembolsosNoLedger).toBe(1);
        // A fatura já estava aberta: não é tocada de novo.
        expect(estado.dadosDaFatura).toBeNull();
        expect(estado.auditoria).toEqual([]);
      },
    );
  });

  describe("reembolso que chega antes do pago", () => {
    // O aviso de reembolso gravado antes do de pago: a cobrança nunca teve
    // `paidAt`. A guarda olha só o status, então segura do mesmo jeito.
    it("o reembolso em cobrança ainda aberta grava REFUNDED sem paidAt e não mexe na fatura", async () => {
      await baixarCobrancaPorIdExterno("123456789", "refunded");

      expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: null });
      // A fatura já estava aberta: nada a reabrir.
      expect(estado.dadosDaFatura).toBeNull();
      expect(estado.pagamentos).toEqual([]);
      expect(estado.auditoria).toEqual([]);
    });

    it("o pago atrasado vira PAGO_APOS_REEMBOLSO e não grava nada", async () => {
      estado.cobranca = aberta({ status: "REFUNDED", paidAt: null });

      const resultado = await baixarCobrancaPorIdExterno("123456789", "approved", new Date("2026-10-05T10:00:00Z"));

      expect(resultado).toBe(estado.cobranca);
      // Nem cobrança, nem fatura, nem ledger: o rastro é o único sinal de que
      // esse dinheiro passou por aqui.
      expect(estado.dadosDaCobranca).toBeNull();
      expect(estado.dadosDaFatura).toBeNull();
      expect(estado.pagamentos).toEqual([]);
      expect(estado.alocacoes).toEqual([]);
      expect(estado.auditoria).toEqual([
        {
          action: "PAGO_APOS_REEMBOLSO",
          entityType: "SubscriptionCharge",
          entityId: "cobranca-1",
          organizationId: "org-1",
          metadata: {
            chargeId: "cobranca-1",
            invoiceId: "fatura-1",
            provider: "MERCADO_PAGO",
            externalId: "123456789",
            status: "approved",
          },
        },
      ]);
      expect(erroNoLog).not.toHaveBeenCalled();
    });
  });

  describe("contestação do Mercado Pago (charged_back)", () => {
    const pagoEm = new Date("2026-09-30T12:00:00Z");
    const RASTRO = {
      action: "CONTESTACAO_REEMBOLSADA",
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      organizationId: "org-1",
      metadata: {
        chargeId: "cobranca-1",
        invoiceId: "fatura-1",
        provider: "MERCADO_PAGO",
        externalId: "123456789",
        status: "charged_back",
        statusDetail: "reimbursed",
      },
    };

    function paga() {
      return aberta({
        status: "PAID",
        paidAt: pagoEm,
        invoice: { id: "fatura-1", status: "PAID", paidAt: pagoEm, ...FATURA_NO_LEDGER },
      });
    }

    function jaReembolsada() {
      return aberta({ status: "REFUNDED", paidAt: pagoEm });
    }

    it("devolvida (reimbursed) deixa rastro e segue contada como reembolso", async () => {
      estado.cobranca = paga();

      await baixarCobrancaPorIdExterno("123456789", "charged_back", pagoEm, "reimbursed");

      // A baixa não muda: desfazer no ledger exige migração.
      expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: pagoEm });
      expect(estado.dadosDaFatura).toEqual({ status: "OPEN", paidAt: null });
      expect(estado.reembolsosNoLedger).toBe(1);
      expect(estado.auditoria).toEqual([RASTRO]);
      expect(erroNoLog).not.toHaveBeenCalled();
    });

    it("devolvida em cobrança que a disputa já tinha reembolsado também deixa rastro, uma vez só", async () => {
      // O caso comum: o `in_process` chegou antes e gravou REFUNDED.
      estado.cobranca = jaReembolsada();

      await baixarCobrancaPorIdExterno("123456789", "charged_back", pagoEm, "reimbursed");
      await baixarCobrancaPorIdExterno("123456789", "charged_back", pagoEm, "reimbursed");

      expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: pagoEm });
      expect(estado.dadosDaFatura).toBeNull();
      expect(estado.auditoria).toEqual([RASTRO]);
    });

    it.each([["in_process"], ["settled"], [null], [undefined], [""]])(
      "sem o detalhe de devolvida (%s) é reembolso comum, sem rastro",
      async (detalhe) => {
        estado.cobranca = paga();

        await baixarCobrancaPorIdExterno("123456789", "charged_back", pagoEm, detalhe);

        expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: pagoEm });
        expect(estado.dadosDaFatura).toEqual({ status: "OPEN", paidAt: null });
        expect(estado.reembolsosNoLedger).toBe(1);
        expect(estado.auditoria).toEqual([]);
      },
    );

    it('"reimbursed" só vale junto de charged_back', async () => {
      estado.cobranca = paga();

      await baixarCobrancaPorIdExterno("123456789", "refunded", pagoEm, "reimbursed");

      expect(estado.dadosDaCobranca).toEqual({ status: "REFUNDED", paidAt: pagoEm });
      expect(estado.auditoria).toEqual([]);
    });
  });

  it("id que não é de nenhuma cobrança nossa não muda nada", async () => {
    estado.cobranca = null;

    expect(await baixarCobrancaPorIdExterno("id-de-outra-conta", "approved")).toBeNull();
    expect(estado.dadosDaCobranca).toBeNull();
    expect(estado.dadosDaFatura).toBeNull();
  });
});
