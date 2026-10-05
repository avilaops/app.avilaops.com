import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { baixarCobrancaPorIdExterno, garantirFatura } from "@/lib/assinaturas";

/**
 * Dois pagamentos simultâneos da mesma fatura, contra o Postgres de verdade —
 * com o gatilho `core.guard_allocation` real decidindo.
 *
 * O teste unitário (`tests/unit/alocacao-concorrente.test.ts`) simula a trava e
 * o gatilho; este é o que prova que o `SELECT ... FOR UPDATE` na fatura
 * serializa as duas baixas no banco, e que a segunda soma já enxergando a
 * alocação da primeira.
 */

const PRODUTO = "produto-alocacao-concorrente-teste";
const PREFIXO = "teste-alocacao-concorrente-";

let organizationId = "";
let invoiceId = "";

async function limpar() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: PREFIXO } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  // O ledger (core.payments) tem FK Restrict à fatura: apagar antes da assinatura.
  await prisma.corePaymentAllocation.deleteMany({ where: { payment: { organizationId: { in: orgIds } } } });
  await prisma.corePayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.operationsAuditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { productKey: PRODUTO } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function cobranca(externalId: string, amount: number) {
  await prisma.subscriptionCharge.create({
    data: { invoiceId, method: "PIX", provider: "MERCADO_PAGO", externalId, status: "PENDING", amount },
  });
}

const alocacoes = () =>
  prisma.corePaymentAllocation.findMany({
    where: { invoiceId },
    select: { amount: true, payment: { select: { externalId: true } } },
  });

beforeEach(async () => {
  await limpar();
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  const organizacao = await prisma.organization.create({
    data: { name: "Cliente Alocação Concorrente", slug: `${PREFIXO}${sufixo}` },
  });
  organizationId = organizacao.id;
  const assinatura = await prisma.subscription.create({
    data: {
      organizationId,
      description: "Mensalidade",
      amount: 300,
      billingDay: 10,
      startedAt: new Date("2026-09-01T00:00:00Z"),
      productKey: PRODUTO,
      productTenantId: `tenant-${sufixo}`,
    },
  });
  const fatura = await garantirFatura({ subscriptionId: assinatura.id, competencia: "2026-09" });
  invoiceId = fatura!.id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("baixarCobrancaPorIdExterno — pagamentos simultâneos da mesma fatura (Postgres)", () => {
  it("dois pagamentos de R$ 200 numa fatura de R$ 300: um aloca 200, o outro os 100 que sobraram", async () => {
    const sufixo = Math.floor(Math.random() * 1e9);
    const [a, b] = [`9${sufixo}1`, `9${sufixo}2`];
    await cobranca(a, 200);
    await cobranca(b, 200);
    const erroNoLog = vi.spyOn(console, "error");

    await Promise.all([baixarCobrancaPorIdExterno(a, "approved"), baixarCobrancaPorIdExterno(b, "approved")]);

    const gravadas = await alocacoes();
    expect(gravadas.map((x) => Number(x.amount)).sort((x, y) => x - y)).toEqual([100, 200]);
    // Os dois pagamentos estão no ledger e nenhum caiu no "best-effort".
    expect(await prisma.corePayment.count({ where: { organizationId, status: "CONFIRMED" } })).toBe(2);
    expect(erroNoLog.mock.calls.filter((c) => String(c[0]).includes("[ledger]"))).toEqual([]);

    // O excedente (R$ 100 de quem chegou depois) fica na auditoria.
    const eventos = await prisma.operationsAuditEvent.findMany({ where: { organizationId } });
    expect(eventos.map((e) => e.action)).toEqual(["PAGAMENTO_ALOCADO_EM_PARTE"]);
    expect(eventos[0].metadata).toMatchObject({ principalCentavos: 20000, alocadoCentavos: 10000, excedenteCentavos: 10000 });
    erroNoLog.mockRestore();
  });

  it("dois pagamentos cheios: um aloca tudo, o outro fica sem alocação e com PAGAMENTO_SEM_ALOCACAO", async () => {
    const sufixo = Math.floor(Math.random() * 1e9);
    const [a, b] = [`8${sufixo}1`, `8${sufixo}2`];
    await cobranca(a, 300);
    await cobranca(b, 300);

    await Promise.all([baixarCobrancaPorIdExterno(a, "approved"), baixarCobrancaPorIdExterno(b, "approved")]);

    const gravadas = await alocacoes();
    expect(gravadas.map((x) => Number(x.amount))).toEqual([300]);
    const eventos = await prisma.operationsAuditEvent.findMany({ where: { organizationId } });
    expect(eventos.map((e) => e.action)).toEqual(["PAGAMENTO_SEM_ALOCACAO"]);
    expect(eventos[0].entityType).toBe("CorePayment");
    expect(eventos[0].metadata).toMatchObject({ invoiceId, excedenteCentavos: 30000 });

    // Reenvio da mesma notificação não duplica nada.
    await baixarCobrancaPorIdExterno(a, "approved");
    await baixarCobrancaPorIdExterno(b, "approved");
    expect(await alocacoes()).toHaveLength(1);
    expect(await prisma.operationsAuditEvent.count({ where: { organizationId } })).toBe(1);
  });
});
