import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O diagnóstico é o que o painel mostra como verde/vermelho. Verde errado é
 * pior que nenhum diagnóstico: o operador confia e a baixa automática fica
 * parada sem ninguém olhar. Aqui só se troca o cofre e a rede — a regra de
 * "saudável" roda de verdade.
 */

const cofre = new Map<string, string>();
vi.mock("@/lib/credenciais", async (original) => ({
  ...(await original<typeof import("@/lib/credenciais")>()),
  obterCredencial: async (chave: string) => cofre.get(chave) ?? null,
}));

import { diagnosticarMercadoPago } from "@/lib/mercadopago";
import { diagnosticarWebhook, EVENTOS_DE_PAGAMENTO } from "@/lib/paypal";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const AMBIENTE = ["APP_URL", "PAYPAL_CLIENT_ID", "PAYPAL_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_AMBIENTE"];
const antes: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const nome of AMBIENTE) antes[nome] = process.env[nome];
  process.env.APP_URL = "https://app.avilaops.com";
  cofre.clear();
});

afterEach(() => {
  for (const nome of AMBIENTE) {
    if (antes[nome] === undefined) delete process.env[nome];
    else process.env[nome] = antes[nome];
  }
  vi.unstubAllGlobals();
});

describe("diagnóstico do PayPal", () => {
  function comWebhookAssinando(eventos: string[], url = "https://app.avilaops.com/api/webhooks/paypal") {
    process.env.PAYPAL_CLIENT_ID = "id-de-teste";
    process.env.PAYPAL_SECRET = "segredo-de-teste";
    process.env.PAYPAL_WEBHOOK_ID = "WH-1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: string | URL | Request) => {
        const destino = String(entrada);
        if (destino.endsWith("/v1/oauth2/token")) return json({ access_token: "acesso" });
        if (destino.includes("/v1/notifications/webhooks/WH-1")) {
          return json({ url, event_types: eventos.map((name) => ({ name })) });
        }
        return json({}, 404);
      }),
    );
  }

  it("webhook só com DENIED não é saudável: nunca avisaria pagamento nem reembolso", async () => {
    comWebhookAssinando(["PAYMENT.CAPTURE.DENIED"]);
    const d = await diagnosticarWebhook();
    expect(d.oauthOk).toBe(true);
    expect(d.erro).toMatch(/PAYMENT\.CAPTURE\.COMPLETED/);
    expect(d.erro).toMatch(/PAYMENT\.CAPTURE\.REFUNDED/);
    expect(d.erro).not.toMatch(/DENIED/);
  });

  it("falta de um único evento tratado pelo handler já reprova", async () => {
    comWebhookAssinando(["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED"]);
    expect((await diagnosticarWebhook()).erro).toBe("O webhook não assina: PAYMENT.CAPTURE.REFUNDED.");
  });

  it("os três eventos de pagamento assinados: saudável", async () => {
    comWebhookAssinando([...EVENTOS_DE_PAGAMENTO, "BILLING.SUBSCRIPTION.CANCELLED"]);
    expect((await diagnosticarWebhook()).erro).toBeNull();
  });

  it("o curinga cobre todos", async () => {
    comWebhookAssinando(["*"]);
    expect((await diagnosticarWebhook()).erro).toBeNull();
  });

  it("eventos certos na URL errada continuam reprovados", async () => {
    comWebhookAssinando([...EVENTOS_DE_PAGAMENTO], "https://antigo.avilaops.com/api/webhooks/paypal");
    expect((await diagnosticarWebhook()).erro).toMatch(/aponta para/);
  });
});

describe("diagnóstico do Mercado Pago", () => {
  const SEGREDO = "segredo-do-webhook-que-nao-pode-vazar";

  beforeEach(() => {
    cofre.set("MP_ACCESS_TOKEN", "APP_USR-token-de-teste");
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: 123, nickname: "AVILAOPS", email: "conta@avilaops.com" })));
  });

  it("token e URL válidos sem MP_WEBHOOK_SECRET: acusa o segredo ausente", async () => {
    const d = await diagnosticarMercadoPago();
    expect(d.tokenOk).toBe(true);
    expect(d.webhookUrl).toBe("https://app.avilaops.com/api/webhooks/mercadopago");
    expect(d.segredoOk).toBe(false);
    expect(d.erro).toMatch(/MP_WEBHOOK_SECRET ausente/);
  });

  it("segredo só com espaço conta como ausente", async () => {
    cofre.set("MP_WEBHOOK_SECRET", "   ");
    expect((await diagnosticarMercadoPago()).segredoOk).toBe(false);
  });

  it("com o segredo: saudável, e o valor não aparece em nenhum campo", async () => {
    cofre.set("MP_WEBHOOK_SECRET", SEGREDO);
    cofre.set("MP_WEBHOOK_TOKEN", "token-da-url");
    const d = await diagnosticarMercadoPago();
    expect(d.segredoOk).toBe(true);
    expect(d.erro).toBeNull();
    const tudo = JSON.stringify(d);
    expect(tudo).not.toContain(SEGREDO);
    expect(tudo).not.toContain("token-da-url");
    expect(tudo).not.toContain("APP_USR-token-de-teste");
  });
});
