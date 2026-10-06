import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * O `status_detail` do Mercado Pago, da API até a baixa.
 *
 * Na contestação o `status` fica em `charged_back` e só o detalhe diz como ela
 * terminou. O webhook lia o pagamento e jogava o detalhe fora, então a baixa
 * não tinha como distinguir a contestação devolvida da perdida.
 *
 * Aqui só a API (`chamarMercadoPago`), o banco e a baixa são simulados: o
 * `consultarPagamento` e a rota são os de verdade. A assinatura tem teste
 * próprio (`mercadopago-assinatura.test.ts`) e o caminho com Postgres está em
 * `tests/integration/webhook-mercadopago.test.ts`.
 */

const { api, baixa } = vi.hoisted(() => ({
  api: { pagamento: {} as Record<string, unknown> },
  baixa: vi.fn(),
}));

vi.mock("@/lib/mercadopago", () => ({
  chamarMercadoPago: async () => api.pagamento,
  urlDeNotificacao: async () => "",
}));
vi.mock("@/lib/assinaturas", () => ({ baixarCobrancaPorIdExterno: baixa }));
vi.mock("@/lib/deliverables", () => ({ markDeliverablePaidAndNotify: vi.fn() }));
vi.mock("@/lib/eventos-webhook", () => ({
  registrarEvento: async () => ({ id: "evento-1" }),
  concluirEvento: async () => undefined,
}));
vi.mock("@/lib/mercadopago-assinatura", () => ({
  segredoDoWebhook: async () => "segredo",
  verificarAssinatura: () => ({ valida: true }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionCharge: { findFirst: async () => ({ id: "cobranca-1" }) },
    deliverableCharge: { findFirst: async () => null },
  },
}));

const { POST } = await import("@/app/api/webhooks/mercadopago/route");

function notificacao(id: string) {
  const url = new URL("https://app.avilaops.com/api/webhooks/mercadopago");
  url.searchParams.set("data.id", id);
  url.searchParams.set("type", "payment");
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({ type: "payment", data: { id } }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  baixa.mockReset();
  delete process.env.MP_WEBHOOK_TOKEN;
});

describe("webhook do Mercado Pago — status_detail", () => {
  it.each([
    ["charged_back", "reimbursed"],
    ["charged_back", "settled"],
    ["charged_back", "in_process"],
    ["refunded", "refunded"],
  ])('repassa o detalhe à baixa ("%s" / "%s")', async (status, status_detail) => {
    api.pagamento = { id: 123456789, status, status_detail, date_approved: "2026-09-30T12:00:00.000Z" };

    const resposta = await POST(notificacao("123456789"));

    expect(resposta.status).toBe(200);
    expect(baixa).toHaveBeenCalledTimes(1);
    expect(baixa).toHaveBeenCalledWith("123456789", status, new Date("2026-09-30T12:00:00.000Z"), status_detail);
  });

  it('o "approved" segue como antes, com o detalhe junto', async () => {
    api.pagamento = { id: 123456789, status: "approved", status_detail: "accredited", date_approved: "2026-09-30T12:00:00.000Z" };

    await POST(notificacao("123456789"));

    expect(baixa).toHaveBeenCalledWith("123456789", "approved", new Date("2026-09-30T12:00:00.000Z"), "accredited");
  });

  it("pagamento sem status_detail chega à baixa com detalhe nulo", async () => {
    api.pagamento = { id: 123456789, status: "charged_back" };

    await POST(notificacao("123456789"));

    expect(baixa).toHaveBeenCalledWith("123456789", "charged_back", null, null);
  });
});
