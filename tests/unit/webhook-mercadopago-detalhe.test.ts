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

const { api, baixa, chamada, registro } = vi.hoisted(() => ({
  api: { pagamento: {} as Record<string, unknown> },
  baixa: vi.fn(),
  chamada: vi.fn(),
  registro: vi.fn(),
}));

vi.mock("@/lib/mercadopago", () => ({
  chamarMercadoPago: async (caminho: string) => {
    chamada(caminho);
    return api.pagamento;
  },
  urlDeNotificacao: async () => "",
}));
vi.mock("@/lib/assinaturas", () => ({ baixarCobrancaPorIdExterno: baixa }));
vi.mock("@/lib/deliverables", () => ({ markDeliverablePaidAndNotify: vi.fn() }));
vi.mock("@/lib/eventos-webhook", () => ({
  registrarEvento: async (evento: unknown) => {
    registro(evento);
    return { id: "evento-1" };
  },
  concluirEvento: async () => undefined,
}));
vi.mock("@/lib/mercadopago-assinatura", () => ({
  segredoDoWebhook: async () => "segredo",
  verificarAssinatura: () => ({ valida: true }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Só o pagamento 123456789 é cobrança nossa.
    subscriptionCharge: {
      findFirst: async ({ where }: { where: { externalId: string } }) =>
        where.externalId === "123456789" ? { id: "cobranca-1" } : null,
    },
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

/**
 * A notificação do tópico de contestação, no formato do exemplo da
 * documentação: `data.id` é o caso (na query também, é o que a assinatura
 * cobre) e o pagamento vem em `data.payment_id`.
 */
function contestacao(dados: Record<string, unknown>, casoNaQuery: string | null = "217000061307271000") {
  const url = new URL("https://app.avilaops.com/api/webhooks/mercadopago");
  if (casoNaQuery !== null) url.searchParams.set("data.id", casoNaQuery);
  url.searchParams.set("type", "topic_chargebacks_wh");
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({
      actions: ["changed_case_status"],
      api_version: "v1",
      data: { checkout: "PRO", id: "217000061307271000", site_id: "MLB", ...dados },
      id: 114544942708,
      live_mode: true,
      type: "topic_chargebacks_wh",
    }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  baixa.mockReset();
  chamada.mockReset();
  registro.mockReset();
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

describe("webhook do Mercado Pago — tópico de contestação", () => {
  it("consulta o pagamento de `data.payment_id` e leva o desfecho à mesma baixa", async () => {
    api.pagamento = { id: 123456789, status: "charged_back", status_detail: "reimbursed", date_approved: "2026-09-30T12:00:00.000Z" };

    const resposta = await POST(contestacao({ payment_id: 123456789 }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, status: "charged_back" });
    // O que se consulta é o pagamento, não o caso da contestação.
    expect(chamada).toHaveBeenCalledTimes(1);
    expect(chamada).toHaveBeenCalledWith("/v1/payments/123456789");
    expect(baixa).toHaveBeenCalledTimes(1);
    expect(baixa).toHaveBeenCalledWith("123456789", "charged_back", new Date("2026-09-30T12:00:00.000Z"), "reimbursed");
  });

  it("o mesmo desfecho pelos dois tópicos chama a baixa com os mesmos argumentos", async () => {
    api.pagamento = { id: 123456789, status: "charged_back", status_detail: "reimbursed", date_approved: "2026-09-30T12:00:00.000Z" };

    await POST(contestacao({ payment_id: 123456789 }));
    await POST(notificacao("123456789"));

    // Uma vez por aviso, e iguais: quem garante um rastro só é a baixa
    // (`baixa-cobranca.test.ts`), que recebe aqui duas chamadas idênticas.
    expect(baixa).toHaveBeenCalledTimes(2);
    expect(baixa.mock.calls[0]).toEqual(baixa.mock.calls[1]);
  });

  it("contestação de pagamento que não é nosso não consulta a API", async () => {
    const resposta = await POST(contestacao({ payment_id: 999 }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, desconhecido: true });
    expect(chamada).not.toHaveBeenCalled();
    expect(baixa).not.toHaveBeenCalled();
  });

  it.each([
    ["sem payment_id", {}],
    ["com payment_id nulo", { payment_id: null }],
    ["com payment_id que não é número", { payment_id: "123456789/../x" }],
  ])("contestação %s é ignorada, sem cair no id do caso", async (_nome, dados) => {
    const resposta = await POST(contestacao(dados));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, ignorado: true });
    expect(chamada).not.toHaveBeenCalled();
    expect(baixa).not.toHaveBeenCalled();
  });
});

describe("webhook do Mercado Pago — id do caso no registro do evento", () => {
  /** O `payload` que a rota mandou gravar em `integration_webhook_events`. */
  function payloadRegistrado() {
    expect(registro).toHaveBeenCalledTimes(1);
    return (registro.mock.calls[0][0] as { payload: unknown }).payload;
  }

  it("contestação com `payment_id` grava o id do caso, sem mexer no `externalId`", async () => {
    api.pagamento = { id: 123456789, status: "charged_back", status_detail: "reimbursed" };

    await POST(contestacao({ payment_id: 123456789 }));

    expect(payloadRegistrado()).toEqual({ pagamentoId: "123456789", requestId: null, casoId: "217000061307271000" });
    expect(registro.mock.calls[0][0]).toMatchObject({ externalId: "123456789", eventType: "topic_chargebacks_wh" });
  });

  it("contestação ignorada por falta de `payment_id` também grava o id do caso", async () => {
    const resposta = await POST(contestacao({}));

    expect(await resposta.json()).toEqual({ ok: true, ignorado: true });
    expect(payloadRegistrado()).toEqual({ pagamentoId: null, requestId: null, casoId: "217000061307271000" });
    // O `externalId` segue sendo o id da notificação, como antes.
    expect(registro.mock.calls[0][0]).toMatchObject({ externalId: "114544942708" });
  });

  it("id do caso como número grande no corpo vem da query, sem arredondar", async () => {
    // No exemplo da documentação o `data.id` é número, e este não cabe num
    // número de JavaScript: lido do corpo, viraria ...71140.
    await POST(contestacao({ id: 217000061307271123 }, "217000061307271123"));

    expect(payloadRegistrado()).toMatchObject({ casoId: "217000061307271123" });
  });

  it("id do caso como número pequeno no corpo é gravado como texto", async () => {
    await POST(contestacao({ id: 4321 }, null));

    expect(payloadRegistrado()).toMatchObject({ casoId: "4321" });
  });

  it.each([
    ["texto", { id: "999" }],
    ["número", { id: 999 }],
  ])("corpo e query divergentes: vale a query, que a assinatura cobre (corpo com %s)", async (_nome, dados) => {
    await POST(contestacao(dados, "217000061307271123"));

    expect(payloadRegistrado()).toMatchObject({ casoId: "217000061307271123" });
  });

  it.each([
    ["vazio", { id: "" }],
    ["inválido", { id: "abc" }],
    ["número decimal", { id: 4321.5 }],
  ])("id %s no corpo não descarta a query válida", async (_nome, dados) => {
    await POST(contestacao(dados, "217000061307271123"));

    expect(payloadRegistrado()).toMatchObject({ casoId: "217000061307271123" });
  });

  it.each([
    ["ausente", null],
    ["inválida", "217/../x"],
    ["vazia", ""],
  ])("query %s cai para o texto do corpo", async (_nome, casoNaQuery) => {
    await POST(contestacao({ id: "555" }, casoNaQuery));

    expect(payloadRegistrado()).toMatchObject({ casoId: "555" });
  });

  it.each([
    ["ausente", { id: undefined }],
    ["nulo", { id: null }],
    ["que não é número", { id: "217/../x" }],
    ["objeto", { id: { a: 1 } }],
    ["número grande, sem a query para conferir", { id: 217000061307271123 }],
    ["número decimal", { id: 4321.5 }],
    ["número decimal pequeno", { id: 0.5 }],
    ["número negativo", { id: -4321 }],
  ])("id do caso %s vira nulo e a notificação segue", async (_nome, dados) => {
    api.pagamento = { id: 123456789, status: "charged_back", status_detail: "reimbursed" };

    const resposta = await POST(contestacao({ payment_id: 123456789, ...dados }, null));

    expect(resposta.status).toBe(200);
    expect(payloadRegistrado()).toEqual({ pagamentoId: "123456789", requestId: null, casoId: null });
    expect(baixa).toHaveBeenCalledTimes(1);
  });

  it("tópico `payment` grava o mesmo payload de antes, sem o campo", async () => {
    api.pagamento = { id: 123456789, status: "approved", status_detail: "accredited" };

    await POST(notificacao("123456789"));

    expect(payloadRegistrado()).toEqual({ pagamentoId: "123456789", requestId: null });
  });
});
