import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarContratacao } from "@/lib/nucleo/contratacao";

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use banco descartável _test.");
const orgs: string[] = [];
async function params() {
  const org = await prisma.organization.create({ data: { name: "Contratação teste", slug: randomUUID() } });
  orgs.push(org.id);
  return { organizationId: org.id, actorId: "test", descricao: "Plano anual", valorCents: 120000,
    dia: 10, ciclo: "YEARLY" as const, inicio: new Date("2026-09-01"), implantacaoCents: 10000,
    produto: "LOJA", tenant: randomUUID() };
}
afterAll(async () => {
  const subs = await prisma.subscription.findMany({ where: { organizationId: { in: orgs } }, select: { id: true } });
  await prisma.coreOutboxEvent.deleteMany({ where: { deduplicationKey: { in: subs.map(s => `subscription.created:${s.id}`) } } });
  await prisma.coreReconciliationIssue.deleteMany({ where: { entityType: "subscriptions", entityId: { in: subs.map(s => s.id) } } });
  await prisma.coreContract.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.coreProduct.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.corePaymentAllocation.deleteMany({ where: { payment: { organizationId: { in: orgs } } } });
  await prisma.corePayment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.operationsAuditEvent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.$disconnect();
});
describe("contratação atômica", () => {
  it("grava contrato, produto, anualidade, implantação e outbox juntos", async () => {
    const p = await params();
    const result = await criarContratacao(p);
    const contract = await prisma.coreContract.findUniqueOrThrow({ where: { legacySubscriptionId: result.assinatura.id }, include: { product: true } });
    expect(contract.billingCycle).toBe("YEARLY");
    expect(Number(contract.amount)).toBe(1200);
    expect(contract.product?.environment).toBe("production");
    expect(result.faturas.map(f => [f.kind, Number(f.amount)])).toEqual([["YEARLY", 1200], ["SETUP", 100]]);
    expect(await prisma.coreOutboxEvent.count({ where: { deduplicationKey: `subscription.created:${result.assinatura.id}` } })).toBe(1);
  });
  it("preserva alias desconhecido como pendência, sem inventar produto", async () => {
    const p = { ...await params(), produto: "legacy-alias" };
    const result = await criarContratacao(p);
    expect(await prisma.coreProduct.count({ where: { organizationId: p.organizationId } })).toBe(0);
    expect(await prisma.coreReconciliationIssue.count({ where: { entityId: result.assinatura.id, code: "PRODUCT_UNRESOLVED" } })).toBe(1);
  });
  it("desfaz assinatura se a criação do contrato falhar", async () => {
    const p = { ...await params(), valorCents: -100 };
    await expect(criarContratacao(p)).rejects.toThrow();
    expect(await prisma.subscription.count({ where: { organizationId: p.organizationId } })).toBe(0);
    expect(await prisma.coreProduct.count({ where: { organizationId: p.organizationId } })).toBe(0);
  });
});
