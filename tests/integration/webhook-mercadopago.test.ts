import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { garantirFatura } from "@/lib/assinaturas";
import { limparCacheDeCredenciais } from "@/lib/credenciais";

/**
 * O webhook do Mercado Pago, que é a porta por onde uma fatura vira "paga".
 *
 * Existia só para a Efí (`webhook-efi.test.ts`) enquanto o gateway que de fato
 * cobra não tinha teste nenhum — o aposentado coberto e o ativo no escuro.
 *
 * O que se verifica aqui é a decisão que o NOSSO código toma: quem provou ser o
 * Mercado Pago, quem não provou, e o que acontece com o dinheiro em cada caso.
 * A API do Mercado Pago é simulada; o que não é simulado é a assinatura, que é
 * calculada de verdade com o mesmo HMAC que eles usam.
 */

const { getPagamentoStatus, aprovacao } = vi.hoisted(() => ({
  getPagamentoStatus: vi.fn(),
  aprovacao: { em: null as Date | null },
}));

// O webhook consulta status e instante de aprovação juntos; o teste controla o
// status pelo mock e a aprovação por `aprovacao.em` (vazia por padrão).
vi.mock("@/lib/mercadopago-cobranca", () => ({
  getPagamentoStatus,
  consultarPagamento: async (id: string) => ({ status: await getPagamentoStatus(id), aprovadoEm: aprovacao.em }),
}));
vi.mock("@/lib/deliverables", () => ({ markDeliverablePaidAndNotify: vi.fn() }));

const { POST } = await import("@/app/api/webhooks/mercadopago/route");

const PRODUTO = "produto-webhook-mp-teste";
const SEGREDO = "segredo-da-aplicacao-mp";
const BASE = "https://app.avilaops.com/api/webhooks/mercadopago";

let invoiceId = "";
let pagamentoId = "";

/**
 * Uma notificação como o Mercado Pago manda: `data.id` na query, `x-request-id`
 * e a assinatura sobre o manifesto dos três.
 */
function notificacao(
  id: string,
  opcoes: { segredo?: string | null; requestId?: string; token?: string; corpo?: unknown } = {},
) {
  const requestId = opcoes.requestId ?? "req-mp-1";
  const ts = "1760000000000";
  const url = new URL(BASE);
  url.searchParams.set("data.id", id);
  url.searchParams.set("type", "payment");
  if (opcoes.token) url.searchParams.set("token", opcoes.token);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": requestId,
  };

  // `segredo: null` simula quem não assina nada — o POST forjado.
  if (opcoes.segredo !== null) {
    const manifesto = `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", opcoes.segredo ?? SEGREDO).update(manifesto).digest("hex");
    headers["x-signature"] = `ts=${ts},v1=${v1}`;
  }

  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(opcoes.corpo ?? { type: "payment", data: { id } }),
    headers,
  });
}

async function limpar() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "teste-webhook-mp-" } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  // O ledger (core.payments) tem FK Restrict à fatura: apagar antes da assinatura.
  await prisma.corePaymentAllocation.deleteMany({ where: { payment: { organizationId: { in: orgIds } } } });
  await prisma.corePayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { productKey: PRODUTO } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: "teste-webhook-mp-" } } });
  // Só este arquivo grava eventos do Mercado Pago no banco descartável.
  await prisma.integrationWebhookEvent.deleteMany({ where: { provider: "mercadopago" } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  aprovacao.em = null;
  process.env.MP_WEBHOOK_SECRET = SEGREDO;
  delete process.env.MP_WEBHOOK_TOKEN;
  // O segredo passa pelo cofre, que guarda o que leu por 60 segundos: sem
  // limpar, o caso que remove a variável continuaria enxergando o valor.
  limparCacheDeCredenciais();
  await limpar();

  const sufixo = Math.floor(Math.random() * 1e9).toString(36);

  const organizacao = await prisma.organization.create({
    data: { name: "Cliente Webhook MP", slug: `teste-webhook-mp-${sufixo}` },
  });

  const assinatura = await prisma.subscription.create({
    data: {
      organizationId: organizacao.id,
      description: "Mensalidade",
      amount: 299,
      billingDay: 10,
      startedAt: new Date("2026-09-01T00:00:00Z"),
      productKey: PRODUTO,
      productTenantId: `tenant-${sufixo}`,
    },
  });

  const fatura = await garantirFatura({
    subscriptionId: assinatura.id,
    competencia: "2026-09",
  });

  invoiceId = fatura!.id;
  // O id do Mercado Pago é numérico, e é isso que o endpoint exige.
  pagamentoId = String(Math.floor(Math.random() * 1e12));

  await prisma.subscriptionCharge.create({
    data: {
      invoiceId,
      method: "PIX",
      provider: "MERCADO_PAGO",
      externalId: pagamentoId,
      status: "PENDING",
      amount: 299,
    },
  });
});

afterAll(async () => {
  delete process.env.MP_WEBHOOK_SECRET;
  await limpar();
  await prisma.$disconnect();
});

async function situacaoDaFatura() {
  return prisma.subscriptionInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { charges: true },
  });
}

describe("assinatura da notificação", () => {
  it("dá baixa quando a assinatura confere e o Mercado Pago confirma", async () => {
    getPagamentoStatus.mockResolvedValue("approved");

    const resposta = await POST(notificacao(pagamentoId));
    expect(resposta.status).toBe(200);

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("PAID");
    expect(fatura.charges[0].status).toBe("PAID");
  });

  it("recusa com 401 quem não assina, e não consulta a API", async () => {
    // O POST forjado: id verdadeiro, nenhuma prova. Antes de 19/09/2026 isto
    // era aceito e fazia o app consultar a API.
    const resposta = await POST(notificacao(pagamentoId, { segredo: null }));

    expect(resposta.status).toBe(401);
    expect(getPagamentoStatus).not.toHaveBeenCalled();
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("recusa assinatura feita com outro segredo", async () => {
    const resposta = await POST(notificacao(pagamentoId, { segredo: "segredo-do-atacante" }));

    expect(resposta.status).toBe(401);
    expect(getPagamentoStatus).not.toHaveBeenCalled();
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("recusa assinatura válida de OUTRO pagamento", async () => {
    // Replay: a assinatura é legítima, mas foi emitida para outro id. Sem o id
    // no manifesto, isto passaria.
    const requestId = "req-mp-replay";
    const ts = "1760000000000";
    const manifesto = `id:999999;request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", SEGREDO).update(manifesto).digest("hex");

    const url = new URL(BASE);
    url.searchParams.set("data.id", pagamentoId);
    const pedido = new NextRequest(url, {
      method: "POST",
      body: JSON.stringify({ type: "payment", data: { id: pagamentoId } }),
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${v1}`,
      },
    });

    expect((await POST(pedido)).status).toBe(401);
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("sem MP_WEBHOOK_SECRET responde 503, para o Mercado Pago reenviar", async () => {
    // Falha fechada, mas sem perder o aviso: 401 diria "não insista", e a
    // fatura ficaria paga com a cobrança aberta. O 503 faz o evento voltar
    // quando o segredo entrar no servidor.
    delete process.env.MP_WEBHOOK_SECRET;
    limparCacheDeCredenciais();
    getPagamentoStatus.mockResolvedValue("approved");

    const resposta = await POST(notificacao(pagamentoId, { segredo: null }));

    expect(resposta.status).toBe(503);
    expect(getPagamentoStatus).not.toHaveBeenCalled();
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("o token da query é conferido antes da assinatura", async () => {
    process.env.MP_WEBHOOK_TOKEN = "token-da-url";
    limparCacheDeCredenciais();

    const semToken = await POST(notificacao(pagamentoId));
    expect(semToken.status).toBe(401);

    getPagamentoStatus.mockResolvedValue("approved");
    const comToken = await POST(notificacao(pagamentoId, { token: "token-da-url" }));
    expect(comToken.status).toBe(200);
    expect((await situacaoDaFatura()).status).toBe("PAID");
  });
});

describe("decisão sobre o dinheiro", () => {
  it("NÃO dá baixa quando a API diz que o pagamento não foi aprovado", async () => {
    getPagamentoStatus.mockResolvedValue("rejected");

    const resposta = await POST(notificacao(pagamentoId));
    expect(resposta.status).toBe(200);

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("OPEN");
    // O estado é registrado: o cliente precisa ver que o cartão foi recusado.
    expect(fatura.charges[0].status).toBe("rejected");
  });

  it("id que não é nosso nem chega a consultar a API", async () => {
    const resposta = await POST(notificacao("123456789000"));

    expect(resposta.status).toBe(200);
    expect(getPagamentoStatus).not.toHaveBeenCalled();
  });

  it("id que não é numérico é ignorado sem consulta", async () => {
    const resposta = await POST(notificacao("../../users/me"));

    expect(resposta.status).toBe(200);
    expect(getPagamentoStatus).not.toHaveBeenCalled();
  });

  it("o mesmo evento repetido não muda a data do pagamento", async () => {
    getPagamentoStatus.mockResolvedValue("approved");

    await POST(notificacao(pagamentoId));
    const primeira = await situacaoDaFatura();

    await new Promise((resolve) => setTimeout(resolve, 25));
    await POST(notificacao(pagamentoId));
    const segunda = await situacaoDaFatura();

    expect(segunda.paidAt?.toISOString()).toBe(primeira.paidAt?.toISOString());
    expect(segunda.charges).toHaveLength(1);
  });

  it("evento fora de ordem não reabre a fatura", async () => {
    getPagamentoStatus.mockResolvedValueOnce("approved");
    await POST(notificacao(pagamentoId));

    getPagamentoStatus.mockResolvedValueOnce("pending");
    await POST(notificacao(pagamentoId));

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("PAID");
    expect(fatura.charges[0].status).toBe("PAID");
  });

  it("API fora do ar devolve 500 para o Mercado Pago reenviar", async () => {
    getPagamentoStatus.mockRejectedValue(new Error("timeout"));

    const resposta = await POST(notificacao(pagamentoId));

    expect(resposta.status).toBe(500);
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });

  it("notificação que não é de pagamento sai com 200, sem mexer em nada", async () => {
    const resposta = await POST(
      notificacao(pagamentoId, { corpo: { type: "subscription_preapproval", data: { id: pagamentoId } } }),
    );

    expect(resposta.status).toBe(200);
    expect(getPagamentoStatus).not.toHaveBeenCalled();
    expect((await situacaoDaFatura()).status).toBe("OPEN");
  });
});

describe("ledger, reembolso e registro do evento", () => {
  it("grava a data de aprovação do Mercado Pago, não a do processamento", async () => {
    aprovacao.em = new Date("2026-09-10T01:30:00Z");
    getPagamentoStatus.mockResolvedValue("approved");

    expect((await POST(notificacao(pagamentoId))).status).toBe(200);

    const fatura = await situacaoDaFatura();
    expect(fatura.paidAt?.toISOString()).toBe("2026-09-10T01:30:00.000Z");
    expect(fatura.charges[0].paidAt?.toISOString()).toBe("2026-09-10T01:30:00.000Z");
    const pagamento = await prisma.corePayment.findFirstOrThrow({ where: { externalId: pagamentoId } });
    expect(pagamento.status).toBe("CONFIRMED");
    expect(pagamento.paidAt?.toISOString()).toBe("2026-09-10T01:30:00.000Z");
  });

  it("aloca só o principal quando a cobrança tem juros de parcelamento", async () => {
    await prisma.subscriptionCharge.updateMany({ where: { externalId: pagamentoId }, data: { amount: 320, interestAmount: 21 } });
    getPagamentoStatus.mockResolvedValue("approved");

    expect((await POST(notificacao(pagamentoId))).status).toBe(200);

    const pagamento = await prisma.corePayment.findFirstOrThrow({
      where: { externalId: pagamentoId },
      include: { allocations: true },
    });
    expect(Number(pagamento.amount)).toBe(320);
    expect(pagamento.allocations).toHaveLength(1);
    expect(Number(pagamento.allocations[0].amount)).toBe(299);
  });

  it("reembolso reabre a fatura e tira o dinheiro dos recebíveis", async () => {
    getPagamentoStatus.mockResolvedValueOnce("approved");
    await POST(notificacao(pagamentoId));
    expect((await situacaoDaFatura()).status).toBe("PAID");

    getPagamentoStatus.mockResolvedValueOnce("refunded");
    expect((await POST(notificacao(pagamentoId, { requestId: "req-mp-2" }))).status).toBe(200);

    const fatura = await situacaoDaFatura();
    expect(fatura.status).toBe("OPEN");
    expect(fatura.paidAt).toBeNull();
    expect(fatura.charges[0].status).toBe("REFUNDED");
    const pagamento = await prisma.corePayment.findFirstOrThrow({ where: { externalId: pagamentoId } });
    expect(pagamento.status).toBe("REFUNDED");
    const [recebivel] = await prisma.$queryRaw<{ outstanding: unknown }[]>`
      SELECT outstanding FROM core.receivables WHERE source='INVOICE' AND source_id=${invoiceId}`;
    expect(Number(recebivel.outstanding)).toBe(299);
  });

  it("registra o evento e marca a situação do tratamento", async () => {
    getPagamentoStatus.mockResolvedValue("approved");
    await POST(notificacao(pagamentoId));

    const evento = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "mercadopago", externalId: pagamentoId },
    });
    expect(evento.status).toBe("PROCESSED");
    expect(evento.processedAt).not.toBeNull();
  });

  it("falha da API fica registrada como FAILED", async () => {
    getPagamentoStatus.mockRejectedValue(new Error("timeout"));
    await POST(notificacao(pagamentoId));

    const evento = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "mercadopago", externalId: pagamentoId },
    });
    expect(evento.status).toBe("FAILED");
    expect(evento.error).toContain("timeout");
  });
});
