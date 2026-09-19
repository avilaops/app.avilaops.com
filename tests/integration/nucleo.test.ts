import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL!);
if (!url.pathname.endsWith("_test")) throw new Error("Núcleo: banco descartável deve terminar em _test.");
const db = new PrismaClient({ log: [] });
type Tx = Prisma.TransactionClient;
const rollback = new Error("rollback-test-fixture");
async function fixture(tx: Tx) {
  const key = randomUUID();
  const org = await tx.organization.create({ data: { name: "Core A", slug: `core-a-${key}` } });
  const other = await tx.organization.create({ data: { name: "Core B", slug: `core-b-${key}` } });
  const identity = await tx.adminIdentity.create({ data: {
    id: key, nome: "Core Test", email: `${key}@example.invalid`, senhaHash: "not-a-password",
    senhaProvisoria: true, role: "ADMIN", organizationId: org.id, ativo: true,
  } });
  const subscription = await tx.subscription.create({ data: { organizationId: org.id, description: "Test", amount: 100, currency: "BRL", billingDay: 10, startedAt: new Date() } });
  const invoice = await tx.subscriptionInvoice.create({ data: { subscriptionId: subscription.id, competence: "2026-09", amount: 100, dueDate: new Date("2026-09-01") } });
  return { key, org, other, identity, subscription, invoice };
}
async function isolated(fn: (tx: Tx, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  try { await db.$transaction(async tx => { await fn(tx, await fixture(tx)); throw rollback; }, { timeout: 30000 }); }
  catch (e) { if (e !== rollback) throw e; }
}
async function rejected(tx: Tx, fn: () => Promise<unknown>) {
  await tx.$executeRawUnsafe("SAVEPOINT expected_failure");
  let failed = false;
  try { await fn(); } catch { failed = true; }
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_failure");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_failure");
  expect(failed).toBe(true);
}
async function confirmed(tx: Tx, org: string, amount = 100, currency = "BRL") {
  return tx.corePayment.create({ data: { organizationId: org, provider: "test", providerAccount: "test", externalId: randomUUID(), amount, currency, status: "CONFIRMED", paidAt: new Date(), source: "TEST" } });
}

afterAll(() => db.$disconnect());
describe("núcleo PostgreSQL — integridade real", () => {
  it("espelha identidade e participação sem duplicar senha", () => isolated(async (tx, f) => {
    const m = await tx.coreMembership.findUniqueOrThrow({ where: { identityId_organizationId: { identityId: f.key, organizationId: f.org.id } } });
    expect(m.role).toBe("ADMIN"); expect(m.source).toBe("LEGACY");
    expect(await tx.coreIdentityLink.count({ where: { identityId: f.key } })).toBe(1);
  }));
  it("revoga o contexto antigo ao mover a conta e bloqueia conta inativa", () => isolated(async (tx, f) => {
    await tx.adminIdentity.update({ where: { id: f.key }, data: { organizationId: f.other.id } });
    const [r] = await tx.$queryRaw<{ a: boolean; b: boolean }[]>`SELECT core.can_access_organization(${f.key},${f.org.id}) a,core.can_access_organization(${f.key},${f.other.id}) b`;
    expect(r).toEqual({ a: false, b: true });
    await tx.adminIdentity.update({ where: { id: f.key }, data: { ativo: false } });
    const [inactive] = await tx.$queryRaw<{ allowed: boolean }[]>`SELECT core.can_access_organization(${f.key},${f.other.id}) allowed`;
    expect(inactive.allowed).toBe(false);
  }));
  it("não transforma OWNER/SOCIO em administrador de cliente por inferência", () => isolated(async (tx, f) => {
    await tx.adminIdentity.update({ where: { id: f.key }, data: { role: "OWNER" } });
    const [r] = await tx.$queryRaw<{ allowed: boolean }[]>`SELECT core.can_access_organization(${f.key},${f.org.id}) allowed`;
    expect(r.allowed).toBe(false);
  }));
  it("bloqueia acesso de participação A a produto B por FK composta", () => isolated(async (tx, f) => {
    const m = await tx.coreMembership.findFirstOrThrow({ where: { identityId: f.key } });
    const p = await tx.coreProduct.create({ data: { organizationId: f.other.id, productKey: "LOJA", tenantId: f.key, source: "TEST" } });
    await rejected(tx, () => tx.coreProductAccess.create({ data: { membershipId: m.id, productId: p.id, organizationId: f.org.id, role: "ADMIN" } }));
  }));
  it("exige evidência para propriedade de ativo externo", () => isolated(async (tx, f) => {
    await rejected(tx, () => tx.coreExternalAsset.create({ data: { provider: "meta", namespace: "test", kind: "PAGE", externalId: f.key, ownerOrganizationId: f.org.id, source: "TEST" } }));
  }));
  it("conexão de outra empresa não autoriza ativo e revogação tira concessão efetiva", () => isolated(async (tx, f) => {
    const a = await tx.coreExternalAccount.create({ data: { provider: "meta", namespace: "test", externalId: f.key } });
    const c = await tx.coreConnection.create({ data: { organizationId: f.org.id, externalAccountId: a.id, status: "AUTHORIZED" } });
    const x = await tx.coreExternalAsset.create({ data: { provider: "meta", namespace: "test", kind: "PAGE", externalId: f.key, externalAccountId: a.id, source: "TEST" } });
    await rejected(tx, () => tx.coreAssetGrant.create({ data: { organizationId: f.other.id, assetId: x.id, connectionId: c.id, role: "MANAGER", source: "TEST", status: "ACTIVE" } }));
    const g = await tx.coreAssetGrant.create({ data: { organizationId: f.org.id, assetId: x.id, connectionId: c.id, role: "MANAGER", source: "TEST", status: "ACTIVE" } });
    expect(await tx.$queryRaw`SELECT id FROM core.effective_asset_grants WHERE id=${g.id}`).toHaveLength(1);
    await tx.coreConnection.update({ where: { id: c.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    expect(await tx.$queryRaw`SELECT id FROM core.effective_asset_grants WHERE id=${g.id}`).toHaveLength(0);
  }));
  it("conserva termos acordados e recusa assinatura de outra empresa", () => isolated(async (tx, f) => {
    const data = { organizationId: f.org.id, legacySubscriptionId: f.subscription.id, description: "Annual", amount: 1200, currency: "USD", billingCycle: "YEARLY", status: "ACTIVE", startsAt: new Date(), source: "TEST" };
    await rejected(tx, () => tx.coreContract.create({ data: { ...data, organizationId: f.other.id } }));
    const c = await tx.coreContract.create({ data });
    await rejected(tx, () => tx.coreContract.update({ where: { id: c.id }, data: { amount: 200 } }));
    await rejected(tx, () => tx.subscription.update({ where: { id: f.subscription.id }, data: { organizationId: f.other.id } }));
  }));
  it("pagamento não pode ser alocado em empresa ou moeda diferente", () => isolated(async (tx, f) => {
    const other = await confirmed(tx, f.other.id);
    const usd = await confirmed(tx, f.org.id, 100, "USD");
    for (const p of [other, usd]) await rejected(tx, () => tx.corePaymentAllocation.create({ data: { paymentId: p.id, invoiceId: f.invoice.id, amount: 50 } }));
  }));
  it("recusa sobrealocação e admite pagamento parcial", () => isolated(async (tx, f) => {
    const p = await confirmed(tx, f.org.id, 60);
    await rejected(tx, () => tx.corePaymentAllocation.create({ data: { paymentId: p.id, invoiceId: f.invoice.id, amount: 61 } }));
    await tx.corePaymentAllocation.create({ data: { paymentId: p.id, invoiceId: f.invoice.id, amount: 60 } });
    const [r] = await tx.$queryRaw<{ outstanding: Prisma.Decimal }[]>`SELECT outstanding FROM core.receivables WHERE source='INVOICE' AND source_id=${f.invoice.id}`;
    expect(Number(r.outstanding)).toBe(40);
    const p2 = await confirmed(tx, f.org.id);
    await rejected(tx, () => tx.corePaymentAllocation.create({ data: { paymentId: p2.id, invoiceId: f.invoice.id, amount: 41 } }));
    await rejected(tx, () => tx.corePayment.update({ where: { id: p.id }, data: { currency: "USD" } }));
  }));
  it("não duplica recebível ao vincular fatura e ledger", () => isolated(async (tx, f) => {
    const l = await tx.ledgerEntry.create({ data: { direction: "RECEIVABLE", description: "Test", amount: 100, currency: "BRL", scope: "EMPRESA", dueDate: new Date() } });
    await tx.coreInvoiceLedgerLink.create({ data: { invoiceId: f.invoice.id, ledgerEntryId: l.id, source: "TEST" } });
    expect(await tx.$queryRaw`SELECT source_id FROM core.receivables WHERE source='LEDGER' AND source_id=${l.id.toString()}`).toHaveLength(0);
    await rejected(tx, () => tx.ledgerEntry.update({ where: { id: l.id }, data: { amount: 200 } }));
    await rejected(tx, () => tx.subscriptionInvoice.update({ where: { id: f.invoice.id }, data: { amount: 200 } }));
  }));
  it("totais preservam moeda, ciclo anual e faturas fora da primeira página", () => isolated(async (tx, f) => {
    await tx.subscription.update({ where: { id: f.subscription.id }, data: { amount: 1200, currency: "USD", billingCycle: "YEARLY" } });
    for (let n=1;n<=13;n++) await tx.subscriptionInvoice.create({ data: { subscriptionId: f.subscription.id, competence: `test-${n}`, amount: 100, dueDate: new Date() } });
    const [t] = await tx.$queryRaw<{ currency: string; outstanding: Prisma.Decimal; open_count: bigint }[]>`SELECT * FROM core.receivable_totals WHERE organization_id=${f.org.id}`;
    expect(t.currency).toBe("USD"); expect(Number(t.outstanding)).toBe(1400); expect(Number(t.open_count)).toBe(14);
    const [s] = await tx.$queryRaw<{ monthly_equivalent: Prisma.Decimal }[]>`SELECT monthly_equivalent FROM core.subscription_totals WHERE organization_id=${f.org.id}`;
    expect(Number(s.monthly_equivalent)).toBe(100);
  }));
  it("histórico registra alteração e recusa apagar evidência", () => isolated(async (tx, f) => {
    const m = await tx.coreMembership.findFirstOrThrow({ where: { identityId: f.key } });
    expect(await tx.coreAuditEvent.count({ where: { entityId: m.id } })).toBeGreaterThan(0);
    await rejected(tx, () => tx.coreAuditEvent.deleteMany({ where: { entityId: m.id } }));
  }));
  it("inbox deduplica; lease antigo não confirma uma execução retomada", () => isolated(async (tx, f) => {
    const e = await tx.coreInboxEvent.create({ data: { provider: f.key, providerAccount: "test", externalId: "event-1", eventType: "paid", payload: {} } });
    await rejected(tx, () => tx.coreInboxEvent.create({ data: { provider: f.key, providerAccount: "test", externalId: "event-1", eventType: "paid", payload: {} } }));
    const [first] = await tx.$queryRaw<{ id: string; lease_token: string }[]>`SELECT * FROM core.claim_inbox('test',100,10) WHERE id=${e.id}`;
    expect(first.id).toBe(e.id);
    await tx.coreInboxEvent.update({ where: { id: e.id }, data: { lockedUntil: new Date(0) } });
    const [second] = await tx.$queryRaw<{ lease_token: string }[]>`SELECT * FROM core.claim_inbox('test',100,10) WHERE id=${e.id}`;
    const [old] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT core.finish_inbox(${e.id},${first.lease_token},true) ok`;
    expect(old.ok).toBe(false);
    const [fresh] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT core.finish_inbox(${e.id},${second.lease_token},true) ok`;
    expect(fresh.ok).toBe(true);
  }));
  it("dois workers concorrentes não reservam o mesmo evento", async () => {
    const prefix = randomUUID();
    await db.coreOutboxEvent.createMany({ data: [1,2].map(n => ({ id: `${prefix}-${n}`, topic: "TEST", deduplicationKey: `${prefix}-${n}`, payload: {} })) });
    try {
      const results = await Promise.all(["a","b"].map(w => db.$queryRaw<{ id: string }[]>`SELECT id FROM core.claim_outbox(${w},1,60)`));
      expect(results[0]).toHaveLength(1); expect(results[1]).toHaveLength(1);
      expect(results[0][0].id).not.toBe(results[1][0].id);
    } finally { await db.coreOutboxEvent.deleteMany({ where: { id: { startsWith: prefix } } }); }
  });
  it("dois pagamentos concorrentes não quitam a mesma fatura além do valor", async () => {
    // Fixture persistida apenas no banco descartável: duas conexões reais.
    const f = await db.$transaction(async tx => {
      const f = await fixture(tx);
      const payments = [await confirmed(tx, f.org.id), await confirmed(tx, f.org.id)];
      return { ...f, payments };
    });
    const results = await Promise.allSettled(f.payments.map(p => db.corePaymentAllocation.create({
      data: { paymentId: p.id, invoiceId: f.invoice.id, amount: 70 },
    })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const sum = await db.corePaymentAllocation.aggregate({ where: { invoiceId: f.invoice.id }, _sum: { amount: true } });
    expect(Number(sum._sum.amount)).toBe(70);
  });
});
