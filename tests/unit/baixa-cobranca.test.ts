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
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionCharge: {
      findFirst: async () => estado.cobranca,
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
  },
}));

const { baixarCobrancaPorIdExterno } = await import("@/lib/assinaturas");

/** Uma cobrança aberta, do jeito que o banco a devolve. */
function aberta(extra: Record<string, unknown> = {}) {
  return {
    id: "cobranca-1",
    invoiceId: "fatura-1",
    status: "PENDING",
    paidAt: null,
    invoice: { id: "fatura-1", status: "OPEN", paidAt: null },
    ...extra,
  };
}

beforeEach(() => {
  estado.dadosDaCobranca = null;
  estado.dadosDaFatura = null;
  estado.cobranca = aberta();
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
  });

  it('grava "PAID" para o "PAID" do Efí, como sempre', async () => {
    await baixarCobrancaPorIdExterno("txid-efi", "PAID");

    expect(estado.dadosDaCobranca?.status).toBe("PAID");
    expect(estado.dadosDaFatura?.status).toBe("PAID");
  });

  it("evento fora de ordem NÃO reabre cobrança já paga no Mercado Pago", async () => {
    // O defeito, em uma linha: a cobrança paga tinha status "approved", a
    // guarda comparava com "PAID", e o "pending" atrasado passava.
    const pagoEm = new Date("2026-09-30T12:00:00Z");
    estado.cobranca = aberta({
      status: "approved",
      paidAt: pagoEm,
      invoice: { id: "fatura-1", status: "PAID", paidAt: pagoEm },
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
    // Recusa não mexe na fatura.
    expect(estado.dadosDaFatura).toBeNull();
  });

  it("não reabre cobrança paga nem quando o status vem em branco", async () => {
    estado.cobranca = aberta({ status: "PAID", paidAt: new Date("2026-09-01T00:00:00Z") });

    await baixarCobrancaPorIdExterno("123456789", "");

    expect(estado.dadosDaCobranca?.status).toBe("PAID");
  });

  it("id que não é de nenhuma cobrança nossa não muda nada", async () => {
    estado.cobranca = null;

    expect(await baixarCobrancaPorIdExterno("id-de-outra-conta", "approved")).toBeNull();
    expect(estado.dadosDaCobranca).toBeNull();
    expect(estado.dadosDaFatura).toBeNull();
  });
});
