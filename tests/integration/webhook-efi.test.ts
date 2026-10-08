import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { garantirFatura } from "@/lib/assinaturas";

/**
 * O webhook é a porta por onde uma fatura vira "paga".
 *
 * Testado com a API do Efí simulada — o que se verifica aqui é a decisão que o
 * nosso código toma diante de cada resposta dela: aviso forjado, evento
 * repetido, evento fora de ordem e txid que não é nosso.
 */

const { getPixChargeStatus, getCobrancaChargeStatus } = vi.hoisted(() => ({
  getPixChargeStatus: vi.fn(),
  getCobrancaChargeStatus: vi.fn(),
}));

vi.mock("@/lib/efi-cobranca", () => ({ getPixChargeStatus, getCobrancaChargeStatus }));
vi.mock("@/lib/deliverables", () => ({ markDeliverablePaidAndNotify: vi.fn() }));

const { POST } = await import("@/app/api/webhooks/efi/route");

const PRODUTO = "produto-webhook-teste";
let invoiceId = "";
let txid = "";

function notificacao(corpo: unknown, url = "https://app.avilaops.com/api/webhooks/efi") {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

async function limpar() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "teste-webhook-" } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  // O ledger (core.payments) tem FK Restrict à fatura: apagar antes da assinatura.
  await prisma.corePaymentAllocation.deleteMany({ where: { payment: { organizationId: { in: orgIds } } } });
  await prisma.corePayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { productKey: PRODUTO } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: "teste-webhook-" } } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.EFI_WEBHOOK_TOKEN;
  await limpar();

  const sufixo = Math.floor(Math.random() * 1e9).toString(36);

  const organizacao = await prisma.organization.create({
    data: { name: "Cliente Webhook", slug: `teste-webhook-${sufixo}` },
  });

  const assinatura = await prisma.subscription.create({
    data: {
      organizationId: organizacao.id,
      description: "Mensalidade",
      amount: 250,
      billingDay: 10,
      startedAt: new Date("2026-08-01T00:00:00Z"),
      productKey: PRODUTO,
      productTenantId: `tenant-${sufixo}`,
    },
  });

  const fatura = await garantirFatura({
    subscriptionId: assinatura.id,
    competencia: "2026-08",
  });

  invoiceId = fatura!.id;
  txid = `txid${sufixo}`;

  await prisma.subscriptionCharge.create({
    data: { invoiceId, method: "PIX", externalId: txid, status: "PENDING", amount: 250 },
  });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function situacaoDaFatura() {
  return prisma.subscriptionInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { charges: true },
  });
}

describe("notificação de PIX", () => {
  it("dá baixa quando o Efí confirma que a cobrança está concluída", async () => {
    getPixChargeStatus.mockResolvedValue("CONCLUIDA");

    const resposta = await POST(notificacao({ pix: [{ txid }] }));
    expect(resposta.status).toBe(200);

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("PAID");
    expect(fatura.charges[0].status).toBe("PAID");
    expect(getPixChargeStatus).toHaveBeenCalledWith(txid);
  });

  it("NÃO dá baixa por aviso forjado: quem manda é a consulta ao Efí", async () => {
    // Este é o ataque real: um POST com um txid válido e nada mais. Antes
    // desta versão, isso quitava a fatura de graça.
    getPixChargeStatus.mockResolvedValue("ATIVA");

    await POST(notificacao({ pix: [{ txid }] }));

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("OPEN");
    expect(fatura.charges[0].status).toBe("PENDING");
  });

  it("txid que não é nosso nem chega a consultar o Efí", async () => {
    // Sem esta guarda o endpoint viraria varredura: manda txid ao acaso e vê
    // quais existem pela demora da resposta.
    const resposta = await POST(notificacao({ pix: [{ txid: "txid-de-outra-conta" }] }));

    expect(resposta.status).toBe(200);
    expect(getPixChargeStatus).not.toHaveBeenCalled();
  });

  it("o mesmo evento repetido não muda a data do pagamento", async () => {
    getPixChargeStatus.mockResolvedValue("CONCLUIDA");

    await POST(notificacao({ pix: [{ txid }] }));
    const primeira = await situacaoDaFatura();

    await new Promise((resolve) => setTimeout(resolve, 25));
    await POST(notificacao({ pix: [{ txid }] }));
    const segunda = await situacaoDaFatura();

    expect(segunda.paidAt?.toISOString()).toBe(primeira.paidAt?.toISOString());
    expect(segunda.charges).toHaveLength(1);
  });

  it("evento fora de ordem não reabre a fatura", async () => {
    getPixChargeStatus.mockResolvedValueOnce("CONCLUIDA");
    await POST(notificacao({ pix: [{ txid }] }));

    // Notificação antiga, entregue depois: o Efí ainda responde "ATIVA" para
    // ela porque foi emitida antes do pagamento.
    getPixChargeStatus.mockResolvedValueOnce("ATIVA");
    await POST(notificacao({ pix: [{ txid }] }));

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("PAID");
    expect(fatura.charges[0].status).toBe("PAID");
  });

  it("Efí fora do ar não deixa a fatura num estado inventado", async () => {
    getPixChargeStatus.mockRejectedValue(new Error("timeout"));

    const resposta = await POST(notificacao({ pix: [{ txid }] }));

    expect(resposta.status).toBe(200);
    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("OPEN");
  });
});

describe("token da URL de notificação", () => {
  it("recusa quem não traz o token, quando ele está configurado", async () => {
    process.env.EFI_WEBHOOK_TOKEN = "segredo-do-webhook";
    getPixChargeStatus.mockResolvedValue("CONCLUIDA");

    const resposta = await POST(notificacao({ pix: [{ txid }] }));

    expect(resposta.status).toBe(401);
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("aceita com o token certo na query", async () => {
    process.env.EFI_WEBHOOK_TOKEN = "segredo-do-webhook";
    getPixChargeStatus.mockResolvedValue("CONCLUIDA");

    const resposta = await POST(
      notificacao(
        { pix: [{ txid }] },
        "https://app.avilaops.com/api/webhooks/efi?token=segredo-do-webhook",
      ),
    );

    expect(resposta.status).toBe(200);
    expect((await situacaoDaFatura()).status).toBe("PAID");
  });
});

describe("notificação de Cobranças (boleto e cartão)", () => {
  it("reconsulta as pendentes e baixa as que o Efí diz pagas", async () => {
    await prisma.subscriptionCharge.updateMany({
      where: { invoiceId },
      data: { method: "BOLETO", status: "PENDING", provider: "EFI" },
    });

    getCobrancaChargeStatus.mockResolvedValue("paid");

    const resposta = await POST(notificacao({ evento: "cobranca" }));

    expect(resposta.status).toBe(200);
    expect((await situacaoDaFatura()).status).toBe("PAID");
  });

  it("boleto do Mercado Pago em aberto não é perguntado ao Efí", async () => {
    // O id é de outro gateway: mandado ao Efí, falha a cada notificação — e
    // no dia em que colidir com um id de lá, baixa a fatura errada.
    await prisma.subscriptionCharge.updateMany({
      where: { invoiceId },
      data: { method: "BOLETO", status: "PENDING", provider: "MERCADO_PAGO" },
    });
    getCobrancaChargeStatus.mockClear();
    getCobrancaChargeStatus.mockResolvedValue("paid");

    const resposta = await POST(notificacao({ evento: "cobranca" }));

    expect(resposta.status).toBe(200);
    expect(getCobrancaChargeStatus).not.toHaveBeenCalled();
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("não mexe no que o Efí ainda considera aberto", async () => {
    await prisma.subscriptionCharge.updateMany({
      where: { invoiceId },
      data: { method: "BOLETO", status: "PENDING", provider: "EFI" },
    });

    getCobrancaChargeStatus.mockResolvedValue("waiting");

    await POST(notificacao({ evento: "cobranca" }));

    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });
});
