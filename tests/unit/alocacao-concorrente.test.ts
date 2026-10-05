import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dois pagamentos da mesma fatura chegando ao mesmo tempo.
 *
 * O defeito: o saldo era lido fora de transação. Os dois viam a fatura inteira
 * em aberto, o gatilho `core.guard_allocation` aceitava o primeiro e rejeitava
 * o segundo ("invoice overpaid"), e o segundo ficava em `core.payments` sem
 * alocação nenhuma — em vez de abater o que sobrou.
 *
 * O banco aqui é simulado, mas com as três coisas que fazem a corrida existir:
 * leitura que cede a vez (como toda ida ao banco), o gatilho que rejeita a
 * alocação que estoura a fatura, e a trava de linha do `FOR UPDATE`, que só é
 * tomada se o código pedir. Tirando o `FOR UPDATE` de `assinaturas.ts`, o
 * segundo pagamento volta a ser rejeitado e o primeiro teste falha.
 *
 * A mesma coisa vale para a auditoria: a procura do evento cede a vez, e a
 * trava consultiva (`pg_advisory_xact_lock`) só existe se o código pedir. Sem
 * ela, duas entregas simultâneas da mesma notificação não acham nada e gravam
 * o evento duas vezes.
 *
 * Contra Postgres de verdade: `tests/integration/alocacao-concorrente.test.ts`.
 */

type Alocacao = { paymentId: string; invoiceId: string; amount: number };

const { banco } = vi.hoisted(() => ({
  banco: {
    cobrancas: [] as Record<string, unknown>[],
    valorDaFatura: 100,
    alocacoes: [] as { paymentId: string; invoiceId: string; amount: number }[],
    auditoria: [] as Record<string, unknown>[],
    /** Fila de quem espera cada trava: a da linha da fatura e a consultiva. */
    travas: new Map<string, Promise<void>>(),
  },
}));

type Evento = Record<string, unknown>;
const mesmoEvento = (where: Evento) => (e: Evento) =>
  e.action === where.action && e.entityType === where.entityType && e.entityId === where.entityId;

/** Toda ida ao banco cede a vez: é o que deixa as duas baixas se intercalarem. */
const idaAoBanco = () => new Promise<void>((ok) => setTimeout(ok, 1));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionCharge: {
      findFirst: async ({ where }: { where: { externalId: string } }) => {
        await idaAoBanco();
        return banco.cobrancas.find((c) => c.externalId === where.externalId) ?? null;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    subscriptionInvoice: { update: async ({ data }: { data: Record<string, unknown> }) => data },
    corePayment: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        await idaAoBanco();
        return { id: `pagamento-${String(create.externalId)}`, ...create };
      },
    },
    operationsAuditEvent: {
      findFirst: async ({ where }: { where: Evento }) => {
        await idaAoBanco();
        return banco.auditoria.find(mesmoEvento(where)) ?? null;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const soltar: (() => void)[] = [];
      // Quem pede uma trava entra na fila dela e só a solta no fim da transação.
      const travar = async (chave: string) => {
        const anterior = banco.travas.get(chave) ?? Promise.resolve();
        banco.travas.set(chave, anterior.then(() => new Promise<void>((ok) => soltar.push(ok))));
        await anterior;
      };
      // O que a transação grava só aparece para as outras no commit.
      const pendentes: Alocacao[] = [];
      const eventos: Evento[] = [];
      const tx = {
        $executeRaw: async (sql: TemplateStringsArray, ...valores: unknown[]) => {
          await idaAoBanco();
          if (sql.join("?").includes("pg_advisory_xact_lock")) await travar(`consultiva:${String(valores[0])}`);
          return 1;
        },
        operationsAuditEvent: {
          // O comando enxerga o que estava confirmado quando começou, e demora
          // mais que a fila da fatura: sem a trava consultiva, a segunda entrega
          // procura antes de a primeira confirmar e não acha nada.
          findFirst: async ({ where }: { where: Evento }) => {
            const achado = banco.auditoria.find(mesmoEvento(where)) ?? null;
            await new Promise<void>((ok) => setTimeout(ok, 15));
            return achado;
          },
          create: async ({ data }: { data: Evento }) => {
            await idaAoBanco();
            eventos.push(data);
            return data;
          },
        },
        $queryRaw: async (sql: TemplateStringsArray, ...valores: unknown[]) => {
          await idaAoBanco();
          if (!sql.join("?").includes("FOR UPDATE")) return [];
          const fatura = String(valores[0]);
          await travar(`fatura:${fatura}`);
          return [{ id: fatura }];
        },
        corePaymentAllocation: {
          aggregate: async ({ where }: { where: { invoiceId: string; paymentId: { not: string } } }) => {
            await idaAoBanco();
            const soma = banco.alocacoes
              .filter((a) => a.invoiceId === where.invoiceId && a.paymentId !== where.paymentId.not)
              .reduce((total, a) => total + a.amount, 0);
            return { _sum: { amount: soma || null } };
          },
          upsert: async ({ create }: { create: Alocacao }) => {
            await idaAoBanco();
            // O gatilho core.guard_allocation: a soma não passa do valor da fatura.
            const jaAlocado = banco.alocacoes
              .filter((a) => a.invoiceId === create.invoiceId && a.paymentId !== create.paymentId)
              .reduce((total, a) => total + a.amount, 0);
            if (jaAlocado + create.amount > banco.valorDaFatura) throw new Error("core: invoice overpaid");
            pendentes.push(create);
            return create;
          },
        },
      };
      try {
        const resultado = await fn(tx);
        banco.alocacoes.push(...pendentes);
        banco.auditoria.push(...eventos);
        return resultado;
      } finally {
        soltar.forEach((ok) => ok());
      }
    },
  },
}));

const { baixarCobrancaPorIdExterno } = await import("@/lib/assinaturas");

function cobranca(externalId: string, amount: number) {
  return {
    id: `cobranca-${externalId}`,
    invoiceId: "fatura-1",
    provider: "MERCADO_PAGO",
    externalId,
    status: "PENDING",
    paidAt: null,
    amount,
    interestAmount: 0,
    invoice: {
      id: "fatura-1",
      status: "OPEN",
      paidAt: null,
      amount: banco.valorDaFatura,
      subscription: { organizationId: "org-1", currency: "BRL" },
    },
  };
}

beforeEach(() => {
  banco.valorDaFatura = 100;
  banco.alocacoes = [];
  banco.auditoria = [];
  banco.travas = new Map();
  vi.restoreAllMocks();
});

describe("baixarCobrancaPorIdExterno — dois pagamentos simultâneos da mesma fatura", () => {
  it("os dois ficam alocados: o primeiro por inteiro, o segundo com o que sobrou", async () => {
    banco.cobrancas = [cobranca("mp-a", 60), cobranca("mp-b", 60)];
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await Promise.all([baixarCobrancaPorIdExterno("mp-a", "approved"), baixarCobrancaPorIdExterno("mp-b", "approved")]);

    expect(banco.alocacoes).toEqual([
      { paymentId: "pagamento-mp-a", invoiceId: "fatura-1", amount: 60 },
      { paymentId: "pagamento-mp-b", invoiceId: "fatura-1", amount: 40 },
    ]);
    // Nada caiu no "best-effort": o gatilho não rejeitou ninguém.
    expect(erroNoLog).not.toHaveBeenCalled();
    // E os R$ 20 que o segundo pagou a mais ficam na trilha de auditoria.
    expect(banco.auditoria).toHaveLength(1);
    expect(banco.auditoria[0]).toMatchObject({
      action: "PAGAMENTO_ALOCADO_EM_PARTE",
      entityId: "pagamento-mp-b",
      metadata: { principalCentavos: 6000, alocadoCentavos: 4000, excedenteCentavos: 2000 },
    });
  });

  it("dois pagamentos que cabem juntos na fatura são alocados por inteiro, sem evento", async () => {
    banco.cobrancas = [cobranca("mp-a", 60), cobranca("mp-b", 40)];

    await Promise.all([baixarCobrancaPorIdExterno("mp-a", "approved"), baixarCobrancaPorIdExterno("mp-b", "approved")]);

    expect(banco.alocacoes.map((a) => a.amount).sort()).toEqual([40, 60]);
    expect(banco.auditoria).toEqual([]);
  });

  it("dois pagamentos cheios da mesma fatura: o segundo fica sem alocação, mas com rastro", async () => {
    banco.cobrancas = [cobranca("mp-a", 100), cobranca("mp-b", 100)];
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await Promise.all([baixarCobrancaPorIdExterno("mp-a", "approved"), baixarCobrancaPorIdExterno("mp-b", "approved")]);

    expect(banco.alocacoes).toEqual([{ paymentId: "pagamento-mp-a", invoiceId: "fatura-1", amount: 100 }]);
    expect(erroNoLog).not.toHaveBeenCalled();
    expect(banco.auditoria).toHaveLength(1);
    expect(banco.auditoria[0]).toMatchObject({
      action: "PAGAMENTO_SEM_ALOCACAO",
      entityType: "CorePayment",
      entityId: "pagamento-mp-b",
      organizationId: "org-1",
      metadata: { chargeId: "cobranca-mp-b", invoiceId: "fatura-1", excedenteCentavos: 10000 },
    });
  });
});

describe("baixarCobrancaPorIdExterno — a mesma notificação entregue duas vezes ao mesmo tempo", () => {
  it("grava o evento de auditoria uma vez só", async () => {
    // A fatura já está coberta por outro pagamento: o de agora não abate nada.
    banco.cobrancas = [cobranca("mp-a", 100)];
    banco.alocacoes = [{ paymentId: "pagamento-anterior", invoiceId: "fatura-1", amount: 100 }];
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await Promise.all([baixarCobrancaPorIdExterno("mp-a", "approved"), baixarCobrancaPorIdExterno("mp-a", "approved")]);

    expect(erroNoLog).not.toHaveBeenCalled();
    expect(banco.auditoria).toHaveLength(1);
    expect(banco.auditoria[0]).toMatchObject({
      action: "PAGAMENTO_SEM_ALOCACAO",
      entityType: "CorePayment",
      entityId: "pagamento-mp-a",
      metadata: { excedenteCentavos: 10000 },
    });
  });

  it("eventos de pagamentos diferentes não esperam um pelo outro nem se confundem", async () => {
    banco.cobrancas = [cobranca("mp-a", 100), cobranca("mp-b", 100)];
    banco.alocacoes = [{ paymentId: "pagamento-anterior", invoiceId: "fatura-1", amount: 100 }];

    await Promise.all([baixarCobrancaPorIdExterno("mp-a", "approved"), baixarCobrancaPorIdExterno("mp-b", "approved")]);

    expect(banco.auditoria.map((e) => e.entityId).sort()).toEqual(["pagamento-mp-a", "pagamento-mp-b"]);
  });
});
