import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { cnpjDeTeste } from "../fixtures/documento";

/**
 * Cobrança personalizada com NFS-e contra Postgres de verdade.
 *
 * Cobre o "Review Focus" do plano
 * `docs/superpowers/plans/2026-11-17-cobranca-personalizada-nfse.md`: o que só
 * o banco decide — fatura sem assinatura, webhook repetido, claim concorrente
 * da fila fiscal e a fronteira entre emissão automática e manual.
 *
 * Simulados ficam só os vizinhos externos: Mercado Pago, ERP e a sessão.
 */

const ext = vi.hoisted(() => ({
  admin: { current: null as null | { id: string; role: string } },
  createBoletoCharge: vi.fn(),
  createPixCharge: vi.fn(),
  emitir: vi.fn(),
  reconciliar: vi.fn(),
  prepararManual: vi.fn(),
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getAdmin: vi.fn(async () => ext.admin.current),
}));
vi.mock("@/lib/mercadopago-cobranca", async (original) => ({
  ...(await original<typeof import("@/lib/mercadopago-cobranca")>()),
  createBoletoCharge: ext.createBoletoCharge,
  createPixCharge: ext.createPixCharge,
}));
vi.mock("@/lib/erp-nfse", async (original) => ({
  ...(await original<typeof import("@/lib/erp-nfse")>()),
  emitirNfseNoErp: ext.emitir,
  reconciliarNfseNoErp: ext.reconciliar,
  prepararNfseManualNoErp: ext.prepararManual,
}));

const { criarFaturaPersonalizada, FaturaPersonalizadaErro } = await import("@/lib/fatura-personalizada");
const { baixarCobrancaPorIdExterno } = await import("@/lib/assinaturas");
const { processarFilaNfse } = await import("@/lib/fila-nfse");
const { ErpNfseErro } = await import("@/lib/erp-nfse");
const { alterarLembreteIndividual, cancelarLembreteIndividual, ReguaIndividualErro } = await import("@/lib/regua-cobranca-individual");
const faturasRoute = await import("@/app/api/organizations/[id]/faturas/route");
const nfseRoute = await import("@/app/api/billing/faturas/[id]/nfse/route");

const PREFIXO = "teste-cobranca-nfse-";
const ORIGEM = "https://app.avilaops.com";

let organizationId = "";
let ownerId = "";
let adminId = "";

async function limpar() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: PREFIXO } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  await prisma.operationsAuditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.corePaymentAllocation.deleteMany({ where: { payment: { organizationId: { in: orgIds } } } });
  await prisma.corePayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscriptionInvoice.deleteMany({ where: { organizationId: { in: orgIds } } });
  const ids = (await prisma.adminIdentity.findMany({ where: { email: { endsWith: "@cobranca-nfse.invalid" } }, select: { id: true } })).map((a) => a.id);
  await prisma.$executeRaw`DELETE FROM core.identity_links WHERE identity_id = ANY(${ids})`;
  await prisma.adminIdentity.deleteMany({ where: { id: { in: ids } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function identidade(role: string) {
  const id = randomUUID();
  await prisma.adminIdentity.create({ data: { id, nome: role, email: `${id}@cobranca-nfse.invalid`, senhaHash: "x", role, ativo: true } });
  return id;
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  organizationId,
  description: "Levantamento topográfico",
  amountCents: 125_000,
  competence: "2026-11",
  dueDate: new Date("2026-11-30T00:00:00Z"),
  automaticNfse: true,
  fiscalServiceCode: "070101",
  fiscalDescription: "Serviços de topografia",
  ...extra,
});

/** Fatura personalizada já paga por PIX no Mercado Pago, via webhook. */
async function faturaPaga() {
  const fatura = await criarFaturaPersonalizada(entrada(), ownerId);
  const externalId = String(Math.floor(Math.random() * 1e12));
  await prisma.subscriptionCharge.create({ data: { invoiceId: fatura.id, method: "PIX", provider: "MERCADO_PAGO", externalId, status: "PENDING", amount: 1250 } });
  await baixarCobrancaPorIdExterno(externalId, "approved", new Date("2026-11-20T12:00:00Z"));
  return { fatura, externalId };
}

function pedido(url: string, init: { method: string; body?: unknown }) {
  return new NextRequest(`${ORIGEM}${url}`, {
    method: init.method,
    headers: { origin: ORIGEM, host: new URL(ORIGEM).host, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await limpar();
  const sufixo = randomUUID().slice(0, 8);
  const org = await prisma.organization.create({
    data: { name: "Engenharia Teste", slug: `${PREFIXO}${sufixo}`, legalName: "Engenharia Teste LTDA", cpfCnpj: cnpjDeTeste(sufixo) },
  });
  organizationId = org.id;
  ownerId = await identidade("OWNER");
  adminId = await identidade("ADMIN");
  ext.admin.current = { id: ownerId, role: "OWNER" };
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("fatura personalizada • Task 1", () => {
  it("nasce vinculada ao cliente, sem assinatura técnica e com auditoria", async () => {
    const fatura = await criarFaturaPersonalizada(entrada(), ownerId);
    expect(fatura).toMatchObject({ kind: "CUSTOM", organizationId, subscriptionId: null, currency: "BRL", status: "OPEN" });
    expect(fatura.amount.toFixed(2)).toBe("1250.00");
    const [saldo] = await prisma.$queryRaw<{ outstanding: unknown }[]>`SELECT outstanding FROM core.receivables WHERE source='INVOICE' AND source_id=${fatura.id}`;
    expect(Number(saldo.outstanding)).toBe(1250);
    expect(await prisma.operationsAuditEvent.count({ where: { entityId: fatura.id, action: "CUSTOM_INVOICE_CREATED" } })).toBe(1);
  });

  it("permite várias avulsas na mesma competência", async () => {
    await criarFaturaPersonalizada(entrada(), ownerId);
    await criarFaturaPersonalizada(entrada(), ownerId);
    expect(await prisma.subscriptionInvoice.count({ where: { organizationId, kind: "CUSTOM", competence: "2026-11" } })).toBe(2);
  });

  it("recusa quem não é dono", async () => {
    await expect(criarFaturaPersonalizada(entrada(), adminId)).rejects.toBeInstanceOf(FaturaPersonalizadaErro);
    expect(await prisma.subscriptionInvoice.count({ where: { organizationId } })).toBe(0);
  });
});

describe("rota de cobrança personalizada • Task 2", () => {
  it("cria a fatura avulsa e o PIX no Mercado Pago", async () => {
    await prisma.organizationProfile.create({ data: { organizationId, email: "financeiro@engenharia.test" } });
    ext.createPixCharge.mockResolvedValue({ externalId: "987654321", copyPaste: "000201", qrCodeBase64: "", expiresAt: new Date("2026-12-01T00:00:00Z") });
    const resposta = await faturasRoute.POST(
      pedido(`/api/organizations/${organizationId}/faturas`, { method: "POST", body: { descricao: "Projeto executivo", valor: "1.250,00", competencia: "2026-11", vencimento: "2026-11-30", metodo: "PIX" } }),
      { params: Promise.resolve({ id: organizationId }) },
    );
    expect(resposta.status).toBe(201);
    expect(ext.createPixCharge).toHaveBeenCalledTimes(1);
    const { invoiceId } = await resposta.json();
    expect(await prisma.subscriptionCharge.count({ where: { invoiceId, provider: "MERCADO_PAGO" } })).toBe(1);
  });

  it("boleto sem endereço falha antes do Mercado Pago e não deixa fatura em aberto", async () => {
    const resposta = await faturasRoute.POST(
      pedido(`/api/organizations/${organizationId}/faturas`, { method: "POST", body: { descricao: "Projeto executivo", valor: "1.250,00", competencia: "2026-11", vencimento: "2026-11-30", metodo: "BOLETO" } }),
      { params: Promise.resolve({ id: organizationId }) },
    );
    expect(resposta.status).toBe(422);
    expect(ext.createBoletoCharge).not.toHaveBeenCalled();

    const faturas = await prisma.subscriptionInvoice.findMany({ where: { organizationId } });
    expect(faturas).toHaveLength(1);
    expect(faturas[0].status).toBe("CANCELLED");
    const [saldo] = await prisma.$queryRaw<{ outstanding: unknown }[]>`SELECT outstanding FROM core.receivables WHERE source='INVOICE' AND source_id=${faturas[0].id}`;
    expect(Number(saldo.outstanding)).toBe(0);
    expect(await prisma.operationsAuditEvent.count({ where: { entityId: faturas[0].id, action: "CUSTOM_INVOICE_DISCARDED" } })).toBe(1);
  });
});

describe("régua individual • Task 3", () => {
  it("etapa em processamento ou enviada é imutável", async () => {
    const fatura = await criarFaturaPersonalizada(entrada(), ownerId);
    for (const status of ["PROCESSING", "SENT"]) {
      const etapa = await prisma.billingEmailDispatch.create({ data: { invoiceId: fatura.id, stage: `CUSTOM:${randomUUID()}`, scheduledFor: new Date(Date.now() + 86_400_000), status } });
      await expect(alterarLembreteIndividual({ invoiceId: fatura.id, dispatchId: etapa.id, content: "fatura", actorId: ownerId })).rejects.toBeInstanceOf(ReguaIndividualErro);
      await expect(cancelarLembreteIndividual({ invoiceId: fatura.id, dispatchId: etapa.id, actorId: ownerId })).rejects.toBeInstanceOf(ReguaIndividualErro);
      expect((await prisma.billingEmailDispatch.findUniqueOrThrow({ where: { id: etapa.id } })).status).toBe(status);
    }
  });
});

describe("emissão automática após pagamento • Tasks 4 e 5", () => {
  it("webhook repetido cria um único comando fiscal", async () => {
    const { fatura, externalId } = await faturaPaga();
    await baixarCobrancaPorIdExterno(externalId, "approved", new Date("2026-11-20T12:00:00Z"));
    await baixarCobrancaPorIdExterno(externalId, "pending");
    expect((await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: fatura.id } })).status).toBe("PAID");
    expect(await prisma.nfseDispatch.count({ where: { invoiceId: fatura.id } })).toBe(1);
  });

  it("o pagamento da avulsa entra no ledger alocado à fatura", async () => {
    const { fatura } = await faturaPaga();
    const alocacoes = await prisma.corePaymentAllocation.findMany({ where: { invoiceId: fatura.id }, include: { payment: true } });
    expect(alocacoes).toHaveLength(1);
    expect(alocacoes[0].amount.toFixed(2)).toBe("1250.00");
    expect(alocacoes[0].payment).toMatchObject({ organizationId, currency: "BRL", status: "CONFIRMED" });
  });

  it("ERP indisponível preserva o pagamento e agenda nova tentativa sem duplicar", async () => {
    const { fatura } = await faturaPaga();
    ext.emitir.mockRejectedValue(new ErpNfseErro("Tempo limite ao chamar o ERP.", true));
    const agora = new Date(Date.now() + 60_000);

    const [a, b] = await Promise.all([processarFilaNfse(agora), processarFilaNfse(agora)]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(ext.emitir).toHaveBeenCalledTimes(1);

    const dispatch = await prisma.nfseDispatch.findUniqueOrThrow({ where: { invoiceId: fatura.id } });
    expect(dispatch).toMatchObject({ status: "UNCERTAIN", attempts: 1, claimToken: null });
    expect(dispatch.nextAttemptAt!.getTime()).toBeGreaterThan(agora.getTime());
    expect((await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: fatura.id } })).status).toBe("PAID");

    expect((await processarFilaNfse(agora)).claimed).toBe(0);

    ext.emitir.mockResolvedValue({ id: "erp-1", externalId: fatura.id, status: "authorized", revision: 1, accessKey: "3".repeat(50) });
    const depois = new Date(dispatch.nextAttemptAt!.getTime() + 1_000);
    expect(await processarFilaNfse(depois)).toMatchObject({ claimed: 1, issued: 1 });
    expect(ext.emitir).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: dispatch.idempotencyKey, externalId: fatura.id }));
    expect(await prisma.nfseDispatch.findUniqueOrThrow({ where: { invoiceId: fatura.id } })).toMatchObject({ status: "ISSUED", erpIssuanceId: "erp-1" });
  });
});

describe("fronteira entre emissão automática e manual • Task 6", () => {
  async function faturaPagaSemAutomatica() {
    const fatura = await criarFaturaPersonalizada(entrada({ automaticNfse: false }), ownerId);
    await prisma.subscriptionInvoice.update({ where: { id: fatura.id }, data: { status: "PAID", paidAt: new Date() } });
    return fatura;
  }

  it("a fila automática não reivindica emissão manual aguardando o XML", async () => {
    const fatura = await faturaPagaSemAutomatica();
    ext.prepararManual.mockResolvedValue({ id: "erp-manual", externalId: fatura.id, status: "pending", revision: 1, portalUrl: "https://www.nfse.gov.br/EmissorNacional" });
    const resposta = await nfseRoute.POST(pedido(`/api/billing/faturas/${fatura.id}/nfse`, { method: "POST" }), { params: Promise.resolve({ id: fatura.id }) });
    expect(resposta.status).toBe(201);

    expect((await processarFilaNfse(new Date(Date.now() + 60_000))).claimed).toBe(0);
    expect(ext.reconciliar).not.toHaveBeenCalled();
    expect(await prisma.nfseDispatch.findUniqueOrThrow({ where: { invoiceId: fatura.id } })).toMatchObject({ issuanceMode: "MANUAL", status: "PENDING", attempts: 0 });
  });

  it("repetir a preparação manual reaproveita a mesma emissão", async () => {
    const fatura = await faturaPagaSemAutomatica();
    ext.prepararManual.mockResolvedValue({ id: "erp-manual", externalId: fatura.id, status: "pending", revision: 1 });
    for (let i = 0; i < 2; i++) {
      const resposta = await nfseRoute.POST(pedido(`/api/billing/faturas/${fatura.id}/nfse`, { method: "POST" }), { params: Promise.resolve({ id: fatura.id }) });
      expect(resposta.status).toBe(201);
    }
    const chaves = ext.prepararManual.mock.calls.map(([input]) => input.idempotencyKey);
    expect(new Set(chaves).size).toBe(1);
  });

  it.each(["ISSUED", "PROCESSING", "UNCERTAIN"])("recusa emissão manual quando a automática já está em %s", async (status) => {
    const { fatura } = await faturaPaga();
    await prisma.nfseDispatch.update({ where: { invoiceId: fatura.id }, data: { status, erpIssuanceId: status === "PROCESSING" ? null : "erp-auto", claimToken: status === "PROCESSING" ? randomUUID() : null } });

    const resposta = await nfseRoute.POST(pedido(`/api/billing/faturas/${fatura.id}/nfse`, { method: "POST" }), { params: Promise.resolve({ id: fatura.id }) });
    expect(resposta.status).toBe(409);
    expect(ext.prepararManual).not.toHaveBeenCalled();
    expect(await prisma.nfseDispatch.findUniqueOrThrow({ where: { invoiceId: fatura.id } })).toMatchObject({ status, issuanceMode: "AUTOMATIC" });
  });

  it("permite assumir manualmente uma automática que falhou sem chegar ao ERP", async () => {
    const { fatura } = await faturaPaga();
    await prisma.nfseDispatch.update({ where: { invoiceId: fatura.id }, data: { status: "FAILED", lastError: "Dados fiscais da fatura incompletos." } });
    ext.prepararManual.mockResolvedValue({ id: "erp-manual", externalId: fatura.id, status: "pending", revision: 1 });

    const resposta = await nfseRoute.POST(pedido(`/api/billing/faturas/${fatura.id}/nfse`, { method: "POST" }), { params: Promise.resolve({ id: fatura.id }) });
    expect(resposta.status).toBe(201);
    expect(await prisma.nfseDispatch.findUniqueOrThrow({ where: { invoiceId: fatura.id } })).toMatchObject({ issuanceMode: "MANUAL", status: "PENDING", erpIssuanceId: "erp-manual" });
  });
});
