import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";

const state = vi.hoisted(() => ({ tx: null as unknown }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.tx; } }));
import { carregarPainelDoCliente } from "@/lib/portal-cliente";
import { empresaVigente, participaDaEmpresa } from "@/lib/nucleo/acesso";
import { criarCobrancaDaFatura } from "@/lib/assinaturas";

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use banco descartável _test.");
const db = new PrismaClient();
const rollback = new Error("rollback");
async function isolated(test: (tx: Prisma.TransactionClient, identityId: string, org: string) => Promise<void>) {
  try {
    await db.$transaction(async tx => {
      state.tx = tx;
      const id = randomUUID();
      const org = await tx.organization.create({ data: { name: "Portal test", slug: id } });
      await tx.adminIdentity.create({ data: { id, nome: "Test", email: `${id}@example.invalid`, senhaHash: "not-a-password", senhaProvisoria: true, role: "ADMIN", ativo: true, organizationId: org.id } });
      await test(tx, id, org.id);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { state.tx = null; }
}
afterAll(() => db.$disconnect());

describe("portal usando o núcleo", () => {
  it("totaliza mais de 12 faturas e mantém moeda/ciclo", () => isolated(async (tx, id, org) => {
    const sub = await tx.subscription.create({ data: { organizationId: org, description: "Anual USD", amount: 1200, currency: "USD", billingCycle: "YEARLY", billingDay: 10, startedAt: new Date() } });
    for (let n = 0; n < 14; n++) await tx.subscriptionInvoice.create({ data: {
      subscriptionId: sub.id, competence: `period-${n}`, amount: 100, dueDate: new Date("2026-01-01"),
    } });
    const brl = await tx.subscription.create({ data: { organizationId: org, description: "Mensal BRL", amount: 50, currency: "BRL", billingCycle: "MONTHLY", billingDay: 10, startedAt: new Date() } });
    await tx.subscriptionInvoice.create({ data: { subscriptionId: brl.id, competence: "2026-01", amount: 50, dueDate: new Date("2026-01-01") } });
    const painel = await carregarPainelDoCliente(id, org);
    expect(painel?.faturas).toHaveLength(12);
    expect(painel?.totais).toEqual(expect.arrayContaining([
      { moeda: "USD", emAberto: 1400, vencido: 1400 }, { moeda: "BRL", emAberto: 50, vencido: 50 },
    ]));
    expect(painel?.recorrencia).toContainEqual({ moeda: "USD", ciclo: "YEARLY", valor: 1200 });
    expect(painel?.assinaturas.find(s => s.id === sub.id)?.ciclo).toBe("YEARLY");
  }));

  it("nega outra empresa, participação revogada e conta desativada", () => isolated(async (tx, id, org) => {
    const other = await tx.organization.create({ data: { name: "Outra", slug: randomUUID() } });
    expect(await carregarPainelDoCliente(id, other.id)).toBeNull();
    expect(await empresaVigente(id, org)).toBe(org);
    await tx.coreMembership.updateMany({ where: { identityId: id }, data: { status: "REVOKED" } });
    expect(await carregarPainelDoCliente(id, org)).toBeNull();
    expect(await empresaVigente(id, org)).toBeNull();
    await tx.coreMembership.updateMany({ where: { identityId: id }, data: { status: "ACTIVE" } });
    await tx.adminIdentity.update({ where: { id }, data: { ativo: false } });
    expect(await carregarPainelDoCliente(id, org)).toBeNull();
  }));

  it("participação de membro não permite administrar equipe", () => isolated(async (tx, id, org) => {
    await tx.coreMembership.updateMany({ where: { identityId: id }, data: { role: "MEMBER", source: "MANUAL" } });
    expect(await participaDaEmpresa(id, org)).toBe(true);
    expect(await participaDaEmpresa(id, org, true)).toBe(false);
  }));

  it("não envia moeda estrangeira como reais ao gateway", () => isolated(async (tx, _id, org) => {
    const sub = await tx.subscription.create({ data: { organizationId: org, description: "USD", amount: 100, currency: "USD", billingDay: 10, startedAt: new Date() } });
    const f = await tx.subscriptionInvoice.create({ data: { subscriptionId: sub.id, competence: "2026-01", amount: 100, dueDate: new Date() } });
    await expect(criarCobrancaDaFatura({ invoiceId: f.id, metodo: "PIX" })).rejects.toThrow("nesta moeda");
    expect(await tx.subscriptionCharge.count({ where: { invoiceId: f.id } })).toBe(0);
  }));

  it("prioriza dívida antiga e mostra saldo parcial sem cobrança integral", () => isolated(async (tx, id, org) => {
    const sub = await tx.subscription.create({ data: { organizationId: org, description: "Test", amount: 100, billingDay: 10, startedAt: new Date() } });
    const old = await tx.subscriptionInvoice.create({ data: { subscriptionId: sub.id, competence: "2020-01", amount: 100, dueDate: new Date("2020-01-01") } });
    await tx.subscriptionCharge.create({ data: { invoiceId: old.id, provider: "TEST", method: "PIX", status: "PENDING", amount: 100, pixCopyPaste: "old-full-charge" } });
    for (let n = 0; n < 13; n++) await tx.subscriptionInvoice.create({ data: { subscriptionId: sub.id, competence: `paid-${n}`, amount: 100, dueDate: new Date("2026-01-01"), status: "PAID" } });
    const payment = await tx.corePayment.create({ data: { organizationId: org, provider: "TEST", providerAccount: "TEST", externalId: randomUUID(), amount: 40, currency: "BRL", status: "CONFIRMED", paidAt: new Date(), source: "TEST" } });
    await tx.corePaymentAllocation.create({ data: { paymentId: payment.id, invoiceId: old.id, amount: 40 } });
    const painel = await carregarPainelDoCliente(id, org);
    expect(painel?.faturas[0]).toMatchObject({ id: old.id, valor: 100, saldo: 60, cobranca: null });
    expect(painel?.totais[0].emAberto).toBe(60);
    await expect(criarCobrancaDaFatura({ invoiceId: old.id, metodo: "PIX" })).rejects.toThrow("Há pagamento registrado");
  }));
});

