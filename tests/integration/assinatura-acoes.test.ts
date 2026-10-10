import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cnpjDeTeste } from "../fixtures/documento";

/**
 * As ações da ficha sobre uma assinatura que já existe, contra Postgres de
 * verdade: mudar o valor, lançar a implantação depois e cancelar uma fatura.
 *
 * Só a sessão é simulada. O que interessa aqui é o que fica gravado — e o que
 * NÃO muda: fatura já emitida com o valor antigo, fatura paga que alguém manda
 * cancelar, segunda implantação no mesmo mês.
 */
const mock = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdmin: mock.admin, ehDono: (role: string) => role === "OWNER" }));

const { PATCH } = await import("@/app/api/organizations/[id]/assinatura/[subId]/route");
const { prisma } = await import("@/lib/prisma");
const { garantirFatura } = await import("@/lib/assinaturas");

const PRODUTO = "produto-de-teste-acoes";
const PREFIXO = "teste-acoes-";

let organizationId = "";
let subscriptionId = "";

async function limpar() {
  await prisma.subscription.deleteMany({ where: { productKey: PRODUTO } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

async function agir(corpo: Record<string, unknown>) {
  const resposta = await PATCH(
    new NextRequest(`http://localhost:3000/api/organizations/${organizationId}/assinatura/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ id: organizationId, subId: subscriptionId }) },
  );
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

const faturas = () => prisma.subscriptionInvoice.findMany({ where: { subscriptionId }, orderBy: { createdAt: "asc" } });
const auditorias = (action: string) => prisma.operationsAuditEvent.findMany({ where: { entityId: subscriptionId, action } });

beforeEach(async () => {
  await limpar();
  mock.admin.mockResolvedValue({ id: "dono-de-teste", role: "OWNER" });

  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  const organizacao = await prisma.organization.create({
    data: { name: "Loja de Teste", slug: `${PREFIXO}${sufixo}`, legalName: "Loja de Teste LTDA", cpfCnpj: cnpjDeTeste(sufixo) },
  });
  const assinatura = await prisma.subscription.create({
    data: {
      organizationId: organizacao.id,
      description: "Loja Pro",
      amount: 357,
      billingDay: 2,
      startedAt: new Date("2026-09-02T00:00:00Z"),
      productKey: PRODUTO,
      productTenantId: `tenant-${sufixo}`,
    },
  });
  organizationId = organizacao.id;
  subscriptionId = assinatura.id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("alterar o valor da assinatura", () => {
  it("vale da próxima fatura em diante; a já emitida fica como nasceu", async () => {
    await garantirFatura({ subscriptionId, competencia: "2026-09" });

    expect(await agir({ acao: "ajustar", valor: "350,00" })).toEqual({ status: 200, corpo: { ok: true } });
    await garantirFatura({ subscriptionId, competencia: "2026-10" });

    expect((await faturas()).map((f) => [f.competence, Number(f.amount)])).toEqual([
      ["2026-09", 357],
      ["2026-10", 350],
    ]);
    const [rastro] = await auditorias("SUBSCRIPTION_ADJUSTED");
    expect(rastro.actorId).toBe("dono-de-teste");
    expect(rastro.metadata).toMatchObject({ valorAntes: "357", valor: 350 });
  });

  it("recusa valor que não é dinheiro, sem mexer na assinatura", async () => {
    expect((await agir({ acao: "ajustar", valor: "-10" })).status).toBe(400);
    expect((await agir({ acao: "ajustar", valor: "abc" })).status).toBe(400);
    expect(Number((await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).amount)).toBe(357);
  });
});

describe("implantação em assinatura que já existe", () => {
  it("cria a fatura na competência do vencimento, com valor próprio, ao lado da mensalidade", async () => {
    await garantirFatura({ subscriptionId, competencia: "2026-09" });

    const resposta = await agir({ acao: "implantacao", valor: "497", vencimento: "2026-09-02" });

    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toMatchObject({ ok: true, competencia: "2026-09" });
    const implantacao = (await faturas()).find((f) => f.kind === "SETUP");
    expect(implantacao).toMatchObject({ id: resposta.corpo.faturaId, competence: "2026-09", status: "OPEN" });
    expect(Number(implantacao?.amount)).toBe(497);
    expect(implantacao?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-02");
    expect(await auditorias("SUBSCRIPTION_SETUP_INVOICE_CREATED")).toHaveLength(1);
  });

  it("a segunda no mesmo mês é recusada, em vez de devolver a primeira como se fosse nova", async () => {
    await agir({ acao: "implantacao", valor: "497", vencimento: "2026-09-02" });

    const segunda = await agir({ acao: "implantacao", valor: "900", vencimento: "2026-09-20" });

    expect(segunda.status).toBe(409);
    expect((await faturas()).map((f) => Number(f.amount))).toEqual([497]);
  });

  it("recusa sem valor, sem vencimento e em assinatura pausada", async () => {
    expect((await agir({ acao: "implantacao", valor: "", vencimento: "2026-09-02" })).status).toBe(400);
    expect((await agir({ acao: "implantacao", valor: "497", vencimento: "02/09/2026" })).status).toBe(400);

    await prisma.subscription.update({ where: { id: subscriptionId }, data: { status: "PAUSED" } });
    expect((await agir({ acao: "implantacao", valor: "497", vencimento: "2026-09-02" })).status).toBe(409);
    expect(await faturas()).toHaveLength(0);
  });
});

describe("cancelar uma fatura", () => {
  it("cancela a aberta e a vencida, e deixa rastro de quem cancelou", async () => {
    const aberta = await garantirFatura({ subscriptionId, competencia: "2026-09" });
    const vencida = await garantirFatura({ subscriptionId, competencia: "2026-10" });
    await prisma.subscriptionInvoice.update({ where: { id: vencida!.id }, data: { status: "OVERDUE" } });

    expect((await agir({ acao: "cancelar-fatura", invoiceId: aberta!.id })).status).toBe(200);
    expect((await agir({ acao: "cancelar-fatura", invoiceId: vencida!.id })).status).toBe(200);

    expect((await faturas()).map((f) => f.status)).toEqual(["CANCELLED", "CANCELLED"]);
    const rastros = await auditorias("SUBSCRIPTION_INVOICE_CANCELLED");
    expect(rastros.map((r) => (r.metadata as { de: string }).de).sort()).toEqual(["OPEN", "OVERDUE"]);
    // A assinatura segue ativa: cancelar uma fatura não é cancelar o contrato.
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).status).toBe("ACTIVE");
  });

  it("fatura paga não se cancela", async () => {
    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-09" });
    await prisma.subscriptionInvoice.update({ where: { id: fatura!.id }, data: { status: "PAID", paidAt: new Date() } });

    expect((await agir({ acao: "cancelar-fatura", invoiceId: fatura!.id })).status).toBe(409);
    expect((await faturas())[0].status).toBe("PAID");
    expect(await auditorias("SUBSCRIPTION_INVOICE_CANCELLED")).toHaveLength(0);
  });

  it("fatura de outra assinatura não é alcançada por esta rota", async () => {
    const outra = await prisma.subscription.create({
      data: {
        organizationId,
        description: "E-mail",
        amount: 40,
        billingDay: 2,
        startedAt: new Date("2026-09-02T00:00:00Z"),
        productKey: PRODUTO,
        productTenantId: `outro-${subscriptionId}`,
      },
    });
    const alheia = await garantirFatura({ subscriptionId: outra.id, competencia: "2026-09" });

    expect((await agir({ acao: "cancelar-fatura", invoiceId: alheia!.id })).status).toBe(404);
    expect((await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: alheia!.id } })).status).toBe("OPEN");
  });
});

describe("quem pode", () => {
  it("sem sessão é 401 e quem não é dono é 403, nos três atos", async () => {
    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-09" });
    const atos = [
      { acao: "ajustar", valor: "350" },
      { acao: "implantacao", valor: "497", vencimento: "2026-09-02" },
      { acao: "cancelar-fatura", invoiceId: fatura!.id },
    ];

    mock.admin.mockResolvedValue(null);
    for (const ato of atos) expect((await agir(ato)).status).toBe(401);
    mock.admin.mockResolvedValue({ id: "socio", role: "SOCIO" });
    for (const ato of atos) expect((await agir(ato)).status).toBe(403);

    expect((await faturas()).map((f) => [f.kind, f.status])).toEqual([["MONTHLY", "OPEN"]]);
    expect(Number((await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).amount)).toBe(357);
  });
});
