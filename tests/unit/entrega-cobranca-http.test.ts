import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A rota de envio de cobrança e o rastro que ela deixa.
 *
 * O defeito que isto cobre: a auditoria era gravada DEPOIS do envio, e a falha
 * de gravação ia só para `console.error`, com a resposta seguindo `ok: true`.
 * Uma mensagem podia sair para o cliente sem registro nenhum e a tela dizia
 * "enviado".
 *
 * Agora a intenção é gravada antes (sem ela, não envia) e o desfecho depois; se
 * o desfecho não grava, a resposta diz. O envio é sempre simulado.
 */

const { estado, CobrancaSemLink } = vi.hoisted(() => {
  class CobrancaSemLink extends Error {}
  return {
    CobrancaSemLink,
    estado: {
      admin: { id: "admin-1", role: "OWNER" } as null | { id: string; role: string },
      /** Ordem do que aconteceu: gravações de auditoria e envios. */
      linha: [] as string[],
      auditoria: [] as Record<string, unknown>[],
      /** Quais gravações de auditoria falham, pela ordem (1 = intenção, 2 = desfecho). */
      auditoriaFalhaNa: [] as number[],
      gravacoes: 0,
      /** O cliente dono do alvo, como o banco responde; `Error` = a leitura falha. */
      clienteDoAlvo: "org-1" as string | null | Error,
      leiturasDoAlvo: [] as string[],
      envios: [] as { canal: string; alvo: unknown; opcoes: unknown }[],
      enviar: (async () => ({
        enviado: true,
        destino: "cliente@exemplo.com",
        organizationId: "org-1",
        invoiceId: "fatura-1",
        chargeId: "cobranca-1" as string | null,
      })) as () => Promise<Record<string, unknown>>,
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getAdmin: async () => estado.admin,
  ehDono: (role: string) => role === "OWNER",
}));
vi.mock("@/lib/http", () => ({ sameOrigin: () => true }));
vi.mock("@/lib/entrega-cobranca", () => {
  const enviarPor = (canal: string) => async (alvo: unknown, opcoes: unknown) => {
    estado.linha.push(`envio:${canal}`);
    estado.envios.push({ canal, alvo, opcoes });
    return estado.enviar();
  };
  return {
    CobrancaSemLink,
    enviarCobrancaPorEmail: enviarPor("email"),
    enviarCobrancaPorWhatsapp: enviarPor("whatsapp"),
  };
});
vi.mock("@/lib/prisma", () => {
  const dono = (modelo: string, id: string) => {
    estado.leiturasDoAlvo.push(`${modelo}:${id}`);
    if (estado.clienteDoAlvo instanceof Error) throw estado.clienteDoAlvo;
    return estado.clienteDoAlvo ? { subscription: { organizationId: estado.clienteDoAlvo } } : null;
  };
  return {
    prisma: {
      subscriptionInvoice: {
        findUnique: async ({ where }: { where: { id: string } }) => dono("fatura", where.id),
      },
      subscriptionCharge: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const invoice = dono("cobranca", where.id);
          return invoice ? { invoice } : null;
        },
      },
      operationsAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          estado.gravacoes += 1;
          if (estado.auditoriaFalhaNa.includes(estado.gravacoes)) throw new Error("banco de auditoria fora do ar");
          estado.linha.push(`auditoria:${String(data.action)}`);
          estado.auditoria.push(data);
          return { id: BigInt(estado.auditoria.length + 40), ...data };
        },
      },
    },
  };
});

const { responderEnvio } = await import("@/lib/entrega-cobranca-http");

const ALVO = { tipo: "fatura", id: "fatura-1" } as const;

function pedido(corpo: unknown) {
  return new NextRequest("https://app.avilaops.com/api/billing/faturas/fatura-1/enviar", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

const AO_CLIENTE = { canal: "email", conteudo: "cobranca", teste: false };

beforeEach(() => {
  estado.admin = { id: "admin-1", role: "OWNER" };
  estado.linha = [];
  estado.auditoria = [];
  estado.auditoriaFalhaNa = [];
  estado.gravacoes = 0;
  estado.clienteDoAlvo = "org-1";
  estado.leiturasDoAlvo = [];
  estado.envios = [];
  estado.enviar = async () => ({
    enviado: true,
    destino: "cliente@exemplo.com",
    organizationId: "org-1",
    invoiceId: "fatura-1",
    chargeId: "cobranca-1",
  });
  vi.restoreAllMocks();
});

describe("responderEnvio — auditoria do envio", () => {
  it("grava a intenção ANTES de enviar e o desfecho depois, ligados pela tentativa", async () => {
    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      ok: true,
      canal: "email",
      teste: false,
      destino: "cliente@exemplo.com",
      registrado: true,
    });
    expect(estado.linha).toEqual(["auditoria:COBRANCA_ENVIO_INICIADO", "envio:email", "auditoria:COBRANCA_ENVIADA"]);
    expect(estado.auditoria[0]).toEqual({
      actorId: "admin-1",
      organizationId: "org-1",
      action: "COBRANCA_ENVIO_INICIADO",
      entityType: "SubscriptionInvoice",
      entityId: "fatura-1",
      metadata: { canal: "email", conteudo: "cobranca", teste: false },
    });
    expect(estado.auditoria[1]).toEqual({
      actorId: "admin-1",
      organizationId: "org-1",
      action: "COBRANCA_ENVIADA",
      entityType: "SubscriptionCharge",
      entityId: "cobranca-1",
      metadata: {
        canal: "email",
        conteudo: "cobranca",
        teste: false,
        destino: "cliente@exemplo.com",
        enviado: true,
        invoiceId: "fatura-1",
        chargeId: "cobranca-1",
        tentativaId: "41",
      },
    });
  });

  it("sem conseguir gravar a intenção, NÃO envia e responde 503", async () => {
    estado.auditoriaFalhaNa = [1];
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(resposta.status).toBe(503);
    expect((await resposta.json()).error).toBe("Não consegui registrar o envio na auditoria. Nada foi enviado.");
    expect(estado.envios).toEqual([]);
    expect(erroNoLog).toHaveBeenCalledTimes(1);
  });

  it("enviou e o desfecho não gravou: a resposta diz, e a intenção fica na trilha", async () => {
    estado.auditoriaFalhaNa = [2];
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);
    const corpo = await resposta.json();

    // A mensagem saiu de fato: não é erro de envio.
    expect(resposta.status).toBe(200);
    expect(estado.envios).toHaveLength(1);
    // Mas não é um "ok" limpo.
    expect(corpo.registrado).toBe(false);
    expect(corpo.aviso).toContain("Não consegui gravar o resultado na auditoria");
    // O rastro que sobra é a intenção, gravada antes do envio.
    expect(estado.auditoria.map((e) => e.action)).toEqual(["COBRANCA_ENVIO_INICIADO"]);
    expect(erroNoLog).toHaveBeenCalledTimes(1);
    expect(erroNoLog.mock.calls[0][0]).toContain("SEM DESFECHO NA AUDITORIA: COBRANCA_ENVIADA de fatura fatura-1 (tentativa 41)");
  });

  it("provedor não entregou: 502 e desfecho COBRANCA_ENVIO_FALHOU, não contato feito", async () => {
    estado.enviar = async () => ({
      enviado: false,
      destino: "cliente@exemplo.com",
      organizationId: "org-1",
      invoiceId: "fatura-1",
      chargeId: null,
    });

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toEqual({
      erro: "O envio falhou no provedor. Veja o log do servidor.",
      error: "O envio falhou no provedor. Veja o log do servidor.",
      destino: "cliente@exemplo.com",
    });
    expect(estado.auditoria.map((e) => e.action)).toEqual(["COBRANCA_ENVIO_INICIADO", "COBRANCA_ENVIO_FALHOU"]);
    expect(estado.auditoria[1]).toMatchObject({ entityType: "SubscriptionInvoice", entityId: "fatura-1" });
  });

  it("provedor não entregou e o desfecho não gravou: o erro leva o aviso", async () => {
    estado.auditoriaFalhaNa = [2];
    estado.enviar = async () => ({ enviado: false, destino: "x@y.z", organizationId: "org-1", invoiceId: "fatura-1", chargeId: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);
    const corpo = await resposta.json();

    expect(resposta.status).toBe(502);
    expect(corpo.registrado).toBe(false);
    expect(corpo.error).toContain("O envio falhou no provedor.");
    expect(corpo.error).toContain("Não consegui gravar o resultado na auditoria");
  });

  it("recusa antes de tentar (sem destino, fatura cancelada...) fecha a intenção como RECUSADO", async () => {
    estado.enviar = async () => {
      throw new CobrancaSemLink("Sem e-mail cadastrado para enviar a cobrança.");
    };

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(resposta.status).toBe(409);
    expect((await resposta.json()).error).toBe("Sem e-mail cadastrado para enviar a cobrança.");
    expect(estado.auditoria.map((e) => e.action)).toEqual(["COBRANCA_ENVIO_INICIADO", "COBRANCA_ENVIO_RECUSADO"]);
    expect(estado.auditoria[1]).toMatchObject({
      // O envio recusado não devolve o cliente: vale o que a intenção achou.
      organizationId: "org-1",
      entityType: "SubscriptionInvoice",
      entityId: "fatura-1",
      metadata: { motivo: "Sem e-mail cadastrado para enviar a cobrança.", tentativaId: "41" },
    });
  });

  it("a intenção leva o cliente dono do alvo, lido antes do envio — pela fatura ou pela cobrança", async () => {
    estado.clienteDoAlvo = "org-7";

    await responderEnvio(pedido(AO_CLIENTE), ALVO);
    await responderEnvio(pedido(AO_CLIENTE), { tipo: "cobranca", id: "cobranca-9" });

    expect(estado.leiturasDoAlvo).toEqual(["fatura:fatura-1", "cobranca:cobranca-9"]);
    const intencoes = estado.auditoria.filter((e) => e.action === "COBRANCA_ENVIO_INICIADO");
    expect(intencoes.map((e) => e.organizationId)).toEqual(["org-7", "org-7"]);
    expect(intencoes.map((e) => e.entityId)).toEqual(["fatura-1", "cobranca-9"]);
  });

  it("enviou e o desfecho não gravou: a intenção que sobra está na trilha do cliente", async () => {
    estado.auditoriaFalhaNa = [2];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({ action: "COBRANCA_ENVIO_INICIADO", organizationId: "org-1" });
  });

  it("alvo que não existe: a intenção vai sem cliente e o envio decide o resto", async () => {
    estado.clienteDoAlvo = null;
    estado.enviar = async () => {
      throw new CobrancaSemLink("Fatura não encontrada.");
    };

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(resposta.status).toBe(409);
    expect(estado.auditoria.map((e) => [e.action, e.organizationId])).toEqual([
      ["COBRANCA_ENVIO_INICIADO", null],
      ["COBRANCA_ENVIO_RECUSADO", null],
    ]);
  });

  it("falha ao descobrir o cliente não segura o envio: intenção sem cliente, desfecho com o do envio", async () => {
    estado.clienteDoAlvo = new Error("conexão caiu");
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await responderEnvio(pedido(AO_CLIENTE), ALVO);

    expect(resposta.status).toBe(200);
    expect(estado.linha).toEqual(["auditoria:COBRANCA_ENVIO_INICIADO", "envio:email", "auditoria:COBRANCA_ENVIADA"]);
    expect(estado.auditoria.map((e) => e.organizationId)).toEqual([null, "org-1"]);
    expect(erroNoLog).toHaveBeenCalledTimes(1);
    expect(erroNoLog.mock.calls[0][0]).toContain("não descobri o cliente de fatura fatura-1");
  });

  it("erro inesperado no envio fecha a intenção como ERRO e responde 500", async () => {
    estado.enviar = async () => {
      throw new Error("ECONNRESET");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await responderEnvio(pedido({ canal: "whatsapp", teste: false }), ALVO);

    expect(resposta.status).toBe(500);
    expect(estado.auditoria.map((e) => e.action)).toEqual(["COBRANCA_ENVIO_INICIADO", "COBRANCA_ENVIO_ERRO"]);
    expect(estado.auditoria[1]).toMatchObject({ metadata: { canal: "whatsapp", erro: "ECONNRESET" } });
  });

  it("envio de teste registra o destino do teste já na intenção", async () => {
    const resposta = await responderEnvio(
      pedido({ canal: "whatsapp", conteudo: "fatura", teste: true, destinoTeste: " 5511999990000 " }),
      { tipo: "cobranca", id: "cobranca-9" },
    );

    expect(resposta.status).toBe(200);
    expect(estado.envios[0]).toEqual({
      canal: "whatsapp",
      alvo: { tipo: "cobranca", id: "cobranca-9" },
      opcoes: { destinoTeste: "5511999990000", conteudo: "fatura" },
    });
    expect(estado.auditoria[0]).toMatchObject({
      action: "COBRANCA_ENVIO_INICIADO",
      entityType: "SubscriptionCharge",
      entityId: "cobranca-9",
      metadata: { canal: "whatsapp", conteudo: "fatura", teste: true, destinoTeste: "5511999990000" },
    });
    // Só a fatura foi enviada: o desfecho aponta para ela, não para a cobrança.
    expect(estado.auditoria[1]).toMatchObject({ action: "COBRANCA_ENVIADA", entityType: "SubscriptionInvoice", entityId: "fatura-1" });
  });

  it("pedido recusado na porta não grava nada nem envia", async () => {
    // Sem canal, teste sem destino, e quem não é o dono.
    expect((await responderEnvio(pedido({ teste: false }), ALVO)).status).toBe(400);
    expect((await responderEnvio(pedido({ canal: "email" }), ALVO)).status).toBe(400);
    estado.admin = { id: "admin-2", role: "ADMIN" };
    expect((await responderEnvio(pedido(AO_CLIENTE), ALVO)).status).toBe(403);
    estado.admin = null;
    expect((await responderEnvio(pedido(AO_CLIENTE), ALVO)).status).toBe(401);

    expect(estado.auditoria).toEqual([]);
    expect(estado.envios).toEqual([]);
  });
});
