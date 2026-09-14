import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  assinaturaDoProduto,
  baixarCobrancaPorIdExterno,
  CobrancaIndisponivelError,
  criarCobrancaDaFatura,
  garantirFatura,
} from "@/lib/assinaturas";
import { prisma } from "@/lib/prisma";

/**
 * Cobrança recorrente contra Postgres de verdade.
 *
 * O que se testa aqui não é a matemática (isso é `tests/unit/parcelamento`) —
 * é o que só o banco decide: a restrição que impede faturar duas vezes, a
 * corrida entre dois processos gerando a mesma competência, e a baixa que
 * precisa aguentar o gateway reenviando o mesmo evento fora de ordem.
 *
 * Nenhum teste daqui chama o gateway. Os caminhos que chamariam são
 * exercitados até o ponto em que ainda dá para recusar sem rede — e desde a
 * troca para o Mercado Pago (30/08/2026) esse ponto inclui o endereço, que o
 * boleto de lá exige e o da Efí não exigia.
 */

const PRODUTO = "produto-de-teste";

let organizationId = "";
let subscriptionId = "";
let productTenantId = "";

async function limpar() {
  await prisma.subscription.deleteMany({ where: { productKey: PRODUTO } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: "teste-cobranca-" } } });
}

async function criarAssinatura(overrides: { billingDay?: number; amount?: number } = {}) {
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);

  const organizacao = await prisma.organization.create({
    data: {
      name: "Restaurante de Teste",
      slug: `teste-cobranca-${sufixo}`,
      legalName: "Restaurante de Teste LTDA",
      cpfCnpj: `${Date.now()}`.slice(0, 14),
    },
  });

  const assinatura = await prisma.subscription.create({
    data: {
      organizationId: organizacao.id,
      description: "Plataforma de restaurantes",
      amount: overrides.amount ?? 250,
      billingDay: overrides.billingDay ?? 10,
      startedAt: new Date("2026-08-01T00:00:00Z"),
      productKey: PRODUTO,
      productTenantId: `tenant-${sufixo}`,
    },
  });

  organizationId = organizacao.id;
  subscriptionId = assinatura.id;
  productTenantId = assinatura.productTenantId ?? "";

  return { organizacao, assinatura };
}

beforeEach(async () => {
  await limpar();
  await criarAssinatura();
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("geração de fatura", () => {
  it("cria a fatura da competência com o valor da assinatura", async () => {
    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-08" });

    expect(fatura).not.toBeNull();
    expect(fatura?.competence).toBe("2026-08");
    expect(fatura?.kind).toBe("MONTHLY");
    expect(fatura?.status).toBe("OPEN");
    expect(Number(fatura?.amount)).toBe(250);
    // Vence no dia da assinatura, não no dia em que o job rodou.
    expect(fatura?.dueDate.toISOString().slice(0, 10)).toBe("2026-08-10");
  });

  it("rodar de novo no mesmo mês devolve a MESMA fatura", async () => {
    const primeira = await garantirFatura({ subscriptionId, competencia: "2026-08" });
    const segunda = await garantirFatura({ subscriptionId, competencia: "2026-08" });

    expect(segunda?.id).toBe(primeira?.id);
    expect(await prisma.subscriptionInvoice.count({ where: { subscriptionId } })).toBe(1);
  });

  it("dois processos gerando a mesma competência ao mesmo tempo criam uma só", async () => {
    // É o cenário real do cron rodando duas vezes — reinício do servidor no
    // meio, ou alguém executando à mão sem saber que o agendamento já rodou.
    const resultados = await Promise.allSettled([
      garantirFatura({ subscriptionId, competencia: "2026-09" }),
      garantirFatura({ subscriptionId, competencia: "2026-09" }),
      garantirFatura({ subscriptionId, competencia: "2026-09" }),
    ]);

    const criadas = await prisma.subscriptionInvoice.findMany({
      where: { subscriptionId, competence: "2026-09" },
    });

    expect(criadas).toHaveLength(1);

    // E nenhuma das chamadas pode ter estourado na cara de quem chamou.
    const falhas = resultados.filter((r) => r.status === "rejected");
    expect(falhas).toHaveLength(0);
  });

  it("implantação e mensalidade convivem na mesma competência", async () => {
    const mensalidade = await garantirFatura({ subscriptionId, competencia: "2026-08" });
    const implantacao = await garantirFatura({
      subscriptionId,
      competencia: "2026-08",
      tipo: "SETUP",
      valorCents: 65_000,
    });

    expect(implantacao?.id).not.toBe(mensalidade?.id);
    expect(Number(implantacao?.amount)).toBe(650);
    expect(await prisma.subscriptionInvoice.count({ where: { subscriptionId } })).toBe(2);
  });

  it("assinatura pausada não gera fatura", async () => {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "PAUSED" },
    });

    expect(await garantirFatura({ subscriptionId, competencia: "2026-08" })).toBeNull();
  });
});

describe("dia de vencimento", () => {
  it("o banco recusa dia que não existe em todo mês", async () => {
    // 29, 30 e 31 não existem em fevereiro. A regra está no CHECK porque
    // assinatura entra por tela, por script e por importação.
    await expect(criarAssinatura({ billingDay: 31 })).rejects.toThrow();
  });

  it("aceita o dia 28", async () => {
    await expect(criarAssinatura({ billingDay: 28 })).resolves.toBeTruthy();
  });
});

describe("baixa da cobrança", () => {
  async function cobrancaPendente() {
    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-08" });

    return prisma.subscriptionCharge.create({
      data: {
        invoiceId: fatura!.id,
        method: "PIX",
        externalId: `txid-${Math.random().toString(36).slice(2)}`,
        status: "PENDING",
        amount: 250,
      },
    });
  }

  it("marca a cobrança e a fatura como pagas", async () => {
    const cobranca = await cobrancaPendente();

    await baixarCobrancaPorIdExterno(cobranca.externalId!, "PAID");

    const depois = await prisma.subscriptionCharge.findUnique({
      where: { id: cobranca.id },
      include: { invoice: true },
    });

    expect(depois?.status).toBe("PAID");
    expect(depois?.paidAt).not.toBeNull();
    expect(depois?.invoice.status).toBe("PAID");
    expect(depois?.invoice.paidAt).not.toBeNull();
  });

  it("reprocessar o mesmo evento não move a data do pagamento", async () => {
    const cobranca = await cobrancaPendente();

    await baixarCobrancaPorIdExterno(cobranca.externalId!, "PAID");
    const primeira = await prisma.subscriptionCharge.findUnique({ where: { id: cobranca.id } });

    await new Promise((resolve) => setTimeout(resolve, 25));
    await baixarCobrancaPorIdExterno(cobranca.externalId!, "PAID");
    const segunda = await prisma.subscriptionCharge.findUnique({
      where: { id: cobranca.id },
      include: { invoice: true },
    });

    // `paidAt` é o instante do pagamento, não o do reprocessamento: mover a
    // data faria a conciliação bancária deixar de bater.
    expect(segunda?.paidAt?.toISOString()).toBe(primeira?.paidAt?.toISOString());
    expect(segunda?.invoice.status).toBe("PAID");
  });

  it("evento atrasado não reabre cobrança já paga", async () => {
    const cobranca = await cobrancaPendente();

    await baixarCobrancaPorIdExterno(cobranca.externalId!, "PAID");
    // A Efí reenvia, e a ordem de chegada não é garantida: um "pendente"
    // emitido antes pode ser processado depois.
    await baixarCobrancaPorIdExterno(cobranca.externalId!, "PENDING");

    const depois = await prisma.subscriptionCharge.findUnique({
      where: { id: cobranca.id },
      include: { invoice: true },
    });

    expect(depois?.status).toBe("PAID");
    expect(depois?.paidAt).not.toBeNull();
    expect(depois?.invoice.status).toBe("PAID");
  });

  it("id externo desconhecido não explode nem inventa fatura", async () => {
    expect(await baixarCobrancaPorIdExterno("txid-que-nao-existe", "PAID")).toBeNull();
  });
});

describe("emissão de cobrança", () => {
  it("recusa fatura já paga, sem chamar o provedor", async () => {
    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-08" });
    await prisma.subscriptionInvoice.update({
      where: { id: fatura!.id },
      data: { status: "PAID", paidAt: new Date() },
    });

    await expect(
      criarCobrancaDaFatura({ invoiceId: fatura!.id, metodo: "PIX" }),
    ).rejects.toBeInstanceOf(CobrancaIndisponivelError);
  });

  it("recusa boleto quando falta o documento e o e-mail", async () => {
    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-08" });

    // Sem documento não há pagador para declarar. A recusa precisa vir daqui,
    // com texto que o cliente entenda, e não como erro 400 do provedor.
    await expect(
      criarCobrancaDaFatura({ invoiceId: fatura!.id, metodo: "BOLETO" }),
    ).rejects.toThrow(/CNPJ \(ou o CPF de quem responde\) e o e-mail/i);
  });

  /*
    Exigência que nasceu com o Mercado Pago (30/08/2026): o boleto pede
    endereço, a Efí não pedia. Mandar sem ele devolve 400 sem dizer qual campo
    faltou, então a recusa tem que ser nossa - e só do boleto, porque PIX e
    cartão continuam passando.
  */
  it("recusa boleto sem endereço, mas o PIX segue disponível", async () => {
    await prisma.organizationProfile.create({
      data: {
        organizationId,
        email: "dono@exemplo.com",
        responsibleCpf: "39053344705",
      },
    });

    const fatura = await garantirFatura({ subscriptionId, competencia: "2026-08" });

    await expect(
      criarCobrancaDaFatura({ invoiceId: fatura!.id, metodo: "BOLETO" }),
    ).rejects.toThrow(/endereço completo/i);

    const resumo = await assinaturaDoProduto({
      productKey: PRODUTO,
      productTenantId,
    });

    expect(resumo?.bloqueioPagamento).toMatch(/endereço completo/i);
  });

  it("com endereço completo, nada bloqueia o boleto", async () => {
    await prisma.organizationProfile.create({
      data: {
        organizationId,
        email: "dono@exemplo.com",
        responsibleCpf: "39053344705",
        postalCode: "14020-000",
        street: "Rua Sete de Setembro",
        number: "1200",
        district: "Centro",
        city: "Ribeirão Preto",
        state: "SP",
      },
    });

    const resumo = await assinaturaDoProduto({
      productKey: PRODUTO,
      productTenantId,
    });

    expect(resumo?.bloqueioPagamento).toBeNull();
  });
});

describe("resumo entregue ao produto", () => {
  it("devolve valores em centavos inteiros e separa aberto de pago", async () => {
    const aberta = await garantirFatura({ subscriptionId, competencia: "2026-08" });
    const paga = await garantirFatura({ subscriptionId, competencia: "2026-07" });

    await prisma.subscriptionInvoice.update({
      where: { id: paga!.id },
      data: { status: "PAID", paidAt: new Date() },
    });

    const assinatura = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });

    const resumo = await assinaturaDoProduto({
      productKey: PRODUTO,
      productTenantId: assinatura.productTenantId!,
    });

    expect(resumo?.valorCents).toBe(25_000);
    expect(resumo?.emAberto.map((f) => f.id)).toEqual([aberta!.id]);
    expect(resumo?.historico.map((f) => f.id)).toEqual([paga!.id]);
    expect(resumo?.emAberto[0].valorCents).toBe(25_000);
    // A simulação vai junto para o produto não recalcular juros por conta.
    expect(resumo?.parcelamento).toHaveLength(12);
    expect(resumo?.parcelamento[11].valorParcelaCents).toBe(2662);
  });

  it("produto sem assinatura devolve nulo, não erro", async () => {
    expect(
      await assinaturaDoProduto({ productKey: PRODUTO, productTenantId: "nao-existe" }),
    ).toBeNull();
  });
});
