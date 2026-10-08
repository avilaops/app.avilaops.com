import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { garantirFatura } from "@/lib/assinaturas";
import { gerarFaturasDaCompetencia, marcarFaturasVencidas } from "@/lib/faturamento-recorrente";
import { prisma } from "@/lib/prisma";

/**
 * A rotina mensal contra o Postgres de verdade: o que importa aqui é o que só
 * o banco decide — rodar duas vezes não fatura duas vezes, simular não grava, e
 * vencer não mexe em fatura paga.
 */

const PREFIXO = "teste-faturamento-rotina-";
const COMPETENCIA = "2026-10";

let organizationId = "";
let ids: { mensalAntiga: string; mensalJaFaturada: string; anualForaDoMes: string; pausada: string };

async function limpar() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: PREFIXO } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  await prisma.operationsAuditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function assinatura(dados: { inicio: string; ciclo?: string; status?: string; valor?: number }) {
  const criada = await prisma.subscription.create({
    data: {
      organizationId,
      description: "Mensalidade de teste",
      amount: dados.valor ?? 300,
      billingDay: 10,
      billingCycle: dados.ciclo ?? "MONTHLY",
      status: dados.status ?? "ACTIVE",
      startedAt: new Date(dados.inicio),
    },
    select: { id: true },
  });
  return criada.id;
}

const todas = () => Object.values(ids);
const faturasDe = (subscriptionId: string) =>
  prisma.subscriptionInvoice.findMany({ where: { subscriptionId }, orderBy: { competence: "asc" } });

beforeEach(async () => {
  await limpar();
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  organizationId = (
    await prisma.organization.create({ data: { name: "Cliente da Rotina", slug: `${PREFIXO}${sufixo}` } })
  ).id;
  ids = {
    mensalAntiga: await assinatura({ inicio: "2026-08-05T12:00:00Z" }),
    mensalJaFaturada: await assinatura({ inicio: "2026-10-02T12:00:00Z", valor: 150 }),
    anualForaDoMes: await assinatura({ inicio: "2026-07-01T12:00:00Z", ciclo: "YEARLY" }),
    pausada: await assinatura({ inicio: "2026-08-05T12:00:00Z", status: "PAUSED" }),
  };
  // A contratação já fatura o mês em que a assinatura nasce.
  await garantirFatura({ subscriptionId: ids.mensalJaFaturada, competencia: COMPETENCIA });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("fatura do mês", () => {
  it("gera só a que falta: a anual fora do aniversário e a pausada ficam de fora", async () => {
    const rodada = await gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() });

    expect(rodada.geradas.map((g) => g.subscriptionId)).toEqual([ids.mensalAntiga]);
    expect(rodada).toMatchObject({ jaExistiam: 1, foraDaCompetencia: 1, falhas: [], simulado: false });

    const [fatura] = await faturasDe(ids.mensalAntiga);
    expect(fatura).toMatchObject({ competence: COMPETENCIA, kind: "MONTHLY", status: "OPEN" });
    expect(Number(fatura.amount)).toBe(300);
    expect(fatura.dueDate.toISOString().slice(0, 10)).toBe("2026-10-10");
    expect(await faturasDe(ids.anualForaDoMes)).toEqual([]);
    expect(await faturasDe(ids.pausada)).toEqual([]);

    const rastro = await prisma.operationsAuditEvent.findMany({ where: { organizationId } });
    expect(rastro.map((e) => [e.action, e.entityId])).toEqual([["FATURA_GERADA_PELA_ROTINA", fatura.id]]);
  });

  it("rodar de novo não fatura de novo nem repete o rastro", async () => {
    await gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() });
    const segunda = await gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() });

    expect(segunda.geradas).toEqual([]);
    expect(segunda.jaExistiam).toBe(2);
    expect(await faturasDe(ids.mensalAntiga)).toHaveLength(1);
    expect(await prisma.operationsAuditEvent.count({ where: { organizationId } })).toBe(1);
  });

  it("duas rodadas ao mesmo tempo deixam uma fatura só", async () => {
    await Promise.all([
      gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() }),
      gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() }),
    ]);
    expect(await faturasDe(ids.mensalAntiga)).toHaveLength(1);
  });

  it("simular diz o que faria e não grava nada", async () => {
    const simulada = await gerarFaturasDaCompetencia({ competencia: COMPETENCIA, simular: true, apenasAssinaturas: todas() });

    expect(simulada.simulado).toBe(true);
    expect(simulada.geradas).toEqual([
      { faturaId: null, subscriptionId: ids.mensalAntiga, organizationId, descricao: "Mensalidade de teste", valor: 300 },
    ]);
    expect(await faturasDe(ids.mensalAntiga)).toEqual([]);
    expect(await prisma.operationsAuditEvent.count({ where: { organizationId } })).toBe(0);
  });

  it("a anual é faturada no mês de aniversário", async () => {
    const rodada = await gerarFaturasDaCompetencia({ competencia: "2027-07", apenasAssinaturas: [ids.anualForaDoMes] });
    expect(rodada.geradas).toHaveLength(1);
    expect((await faturasDe(ids.anualForaDoMes))[0]).toMatchObject({ competence: "2027-07", kind: "YEARLY" });
  });
});

describe("vencimento", () => {
  const AGORA = new Date("2026-10-11T15:00:00Z"); // dia 11 no Brasil: quem vencia dia 10 venceu.

  it("a aberta que venceu ontem vira OVERDUE, com rastro; a paga e a que vence hoje ficam", async () => {
    await gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() });
    const [vencida] = await faturasDe(ids.mensalAntiga);
    const [paga] = await faturasDe(ids.mensalJaFaturada);
    await prisma.subscriptionInvoice.update({ where: { id: paga.id }, data: { status: "PAID", paidAt: new Date() } });
    const venceHoje = await garantirFatura({
      subscriptionId: ids.anualForaDoMes,
      competencia: COMPETENCIA,
      vencimento: new Date("2026-10-11T00:00:00Z"),
    });

    const rodada = await marcarFaturasVencidas({ agora: AGORA, apenasAssinaturas: todas() });

    expect(rodada.hoje).toBe("2026-10-11");
    expect(rodada.vencidas.map((v) => v.faturaId)).toEqual([vencida.id]);
    const estado = async (id: string) => (await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id } })).status;
    expect(await estado(vencida.id)).toBe("OVERDUE");
    expect(await estado(paga.id)).toBe("PAID");
    expect(await estado(venceHoje!.id)).toBe("OPEN");
    expect(
      await prisma.operationsAuditEvent.count({ where: { action: "FATURA_VENCIDA", entityId: vencida.id } }),
    ).toBe(1);

    // Segunda rodada: nada novo, nenhum rastro repetido.
    expect((await marcarFaturasVencidas({ agora: AGORA, apenasAssinaturas: todas() })).vencidas).toEqual([]);
    expect(await prisma.operationsAuditEvent.count({ where: { action: "FATURA_VENCIDA", organizationId } })).toBe(1);
  });

  it("simular lista e não muda o status", async () => {
    await gerarFaturasDaCompetencia({ competencia: COMPETENCIA, apenasAssinaturas: todas() });
    const simulada = await marcarFaturasVencidas({ agora: AGORA, simular: true, apenasAssinaturas: todas() });
    expect(simulada.vencidas).toHaveLength(2);
    expect(await prisma.subscriptionInvoice.count({ where: { subscription: { organizationId }, status: "OVERDUE" } })).toBe(0);
  });
});
