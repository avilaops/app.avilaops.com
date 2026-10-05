import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A consulta de saldo da entrega (`saldoEmAberto`/`carregarAlvo`), com o banco
 * simulado.
 *
 * `garantirEnviavel` já é testada como regra pura; faltava provar a ponte: que
 * o saldo sai de `core.receivables` pela fatura certa, que chega à regra, e
 * que cobrança com valor diferente do saldo não sai para ninguém.
 */

type Consulta = { sql: string; valores: unknown[] };

const { estado } = vi.hoisted(() => ({
  estado: {
    cobranca: null as null | Record<string, unknown>,
    fatura: null as null | Record<string, unknown>,
    linhasDoSaldo: [] as { outstanding: unknown }[],
    consultas: [] as { sql: string; valores: unknown[] }[],
    buscaDaFatura: null as null | Record<string, unknown>,
    emails: [] as { to: string; html: string }[],
    whatsapps: [] as { to: string; text: string }[],
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionCharge: { findUnique: async () => estado.cobranca },
    subscriptionInvoice: {
      findUnique: async (args: Record<string, unknown>) => {
        estado.buscaDaFatura = args;
        return estado.fatura;
      },
    },
    $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      estado.consultas.push({ sql: partes.join("?"), valores });
      return estado.linhasDoSaldo;
    },
  },
}));
vi.mock("@/lib/email", () => ({
  avisarPorEmail: async (email: { to: string; html: string }) => {
    estado.emails.push(email);
    return true;
  },
}));
vi.mock("@/lib/whatsapp-saida", () => ({
  avisarPorWhatsapp: async (mensagem: { to: string; text: string }) => {
    estado.whatsapps.push(mensagem);
    return true;
  },
}));

const { CobrancaSemLink, enviarCobrancaPorEmail, enviarCobrancaPorWhatsapp } = await import("@/lib/entrega-cobranca");

const FATURA = {
  id: "fatura-1",
  status: "OPEN",
  amount: 100,
  competence: "2026-10",
  dueDate: new Date("2026-10-10T00:00:00Z"),
  subscription: {
    description: "Loja Pro",
    currency: "BRL",
    organization: {
      id: "org-1",
      name: "Lojas Maria",
      profile: { email: "maria@cliente.com", ownerName: "Maria", whatsapp: "5511988887777", phone: null },
      contacts: [],
    },
  },
};

const COBRANCA = {
  id: "cobranca-1",
  invoiceId: "fatura-1",
  status: "PENDING",
  method: "PIX",
  amount: 100,
  interestAmount: 0,
  boletoUrl: null,
  boletoBarcode: null,
  pixCopyPaste: "00020126PIX...5204",
  checkoutUrl: null,
  expiresAt: new Date("2099-01-01T00:00:00Z"),
};

const TESTE = { destinoTeste: "operador@avilaops.com" };

beforeEach(() => {
  estado.cobranca = { ...COBRANCA, invoice: FATURA };
  estado.fatura = { ...FATURA, charges: [COBRANCA] };
  estado.linhasDoSaldo = [{ outstanding: "100.00" }];
  estado.consultas = [];
  estado.buscaDaFatura = null;
  estado.emails = [];
  estado.whatsapps = [];
});

describe("saldo em aberto na entrega da cobrança", () => {
  it("consulta core.receivables pela fatura da cobrança", async () => {
    await enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE);

    expect(estado.consultas).toHaveLength(1);
    const [consulta] = estado.consultas as Consulta[];
    expect(consulta.sql).toContain("core.receivables");
    expect(consulta.sql).toContain("source='INVOICE'");
    expect(consulta.sql).toContain("source_id=?");
    // O id vai como parâmetro, nunca concatenado no SQL.
    expect(consulta.valores).toEqual(["fatura-1"]);
  });

  it("saldo igual ao valor da cobrança: envia, e devolve fatura e cobrança", async () => {
    const r = await enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE);

    expect(r).toEqual({
      enviado: true,
      destino: "operador@avilaops.com",
      organizationId: "org-1",
      invoiceId: "fatura-1",
      chargeId: "cobranca-1",
    });
    expect(estado.emails).toHaveLength(1);
    expect(estado.emails[0].html).toContain("00020126PIX...5204");
  });

  it("o saldo vem como texto (numeric do Postgres) e é lido como número", async () => {
    estado.linhasDoSaldo = [{ outstanding: "100.00" }];

    await expect(enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE)).resolves.toMatchObject({ enviado: true });
  });

  it("pagamento parcial (saldo 40 para cobrança de 100): recusa e não envia", async () => {
    estado.linhasDoSaldo = [{ outstanding: "40.00" }];

    await expect(enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE)).rejects.toThrow(/saldo em aberto/);
    expect(estado.emails).toEqual([]);
  });

  it("fatura totalmente alocada (saldo 0): recusa e não envia", async () => {
    estado.linhasDoSaldo = [{ outstanding: "0" }];

    await expect(enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE)).rejects.toBeInstanceOf(CobrancaSemLink);
    expect(estado.emails).toEqual([]);
  });

  it("fatura fora de core.receivables (sem linha): saldo desconhecido, recusa", async () => {
    estado.linhasDoSaldo = [];

    await expect(enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE)).rejects.toThrow(/conferir o saldo/);
    expect(estado.emails).toEqual([]);
  });

  it("cartão parcelado: compara o principal (sem juros) com o saldo", async () => {
    estado.cobranca = {
      ...COBRANCA,
      method: "CARD",
      amount: 112.4,
      interestAmount: 12.4,
      pixCopyPaste: null,
      checkoutUrl: "https://pagar.exemplo/abc",
      invoice: FATURA,
    };

    await expect(enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, TESTE)).resolves.toMatchObject({ enviado: true });
  });

  it("o resumo da fatura sai mesmo com saldo divergente (não leva link)", async () => {
    estado.linhasDoSaldo = [{ outstanding: "40.00" }];

    const r = await enviarCobrancaPorEmail({ tipo: "cobranca", id: "cobranca-1" }, { ...TESTE, conteudo: "fatura" });

    expect(r.enviado).toBe(true);
    expect(estado.emails[0].html).not.toContain("00020126PIX");
  });
});

describe("carregarAlvo pela fatura", () => {
  it("usa a cobrança mais recente da fatura e o saldo dela", async () => {
    const r = await enviarCobrancaPorEmail({ tipo: "fatura", id: "fatura-1" }, TESTE);

    expect(estado.buscaDaFatura).toMatchObject({
      where: { id: "fatura-1" },
      include: { charges: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    expect((estado.consultas as Consulta[])[0].valores).toEqual(["fatura-1"]);
    expect(r.chargeId).toBe("cobranca-1");
  });

  it("fatura sem cobrança: o resumo sai, o link não", async () => {
    estado.fatura = { ...FATURA, charges: [] };

    const resumo = await enviarCobrancaPorEmail({ tipo: "fatura", id: "fatura-1" }, { ...TESTE, conteudo: "fatura" });
    expect(resumo).toMatchObject({ enviado: true, chargeId: null });

    await expect(enviarCobrancaPorEmail({ tipo: "fatura", id: "fatura-1" }, TESTE)).rejects.toThrow(/não tem cobrança emitida/);
  });

  it("alvo inexistente não chega a consultar saldo", async () => {
    estado.fatura = null;
    estado.cobranca = null;

    await expect(enviarCobrancaPorEmail({ tipo: "fatura", id: "nao-existe" }, TESTE)).rejects.toThrow("Fatura não encontrada.");
    await expect(enviarCobrancaPorEmail({ tipo: "cobranca", id: "nao-existe" }, TESTE)).rejects.toThrow("Cobrança não encontrada.");
    expect(estado.consultas).toEqual([]);
  });

  it("WhatsApp passa pela mesma consulta e pela mesma recusa", async () => {
    const destino = { destinoTeste: "5511999990000" };
    await expect(enviarCobrancaPorWhatsapp({ tipo: "fatura", id: "fatura-1" }, destino)).resolves.toMatchObject({
      enviado: true,
      destino: "5511999990000",
    });

    estado.linhasDoSaldo = [{ outstanding: "40.00" }];
    await expect(enviarCobrancaPorWhatsapp({ tipo: "fatura", id: "fatura-1" }, destino)).rejects.toBeInstanceOf(CobrancaSemLink);
    expect(estado.whatsapps).toHaveLength(1);
  });
});
