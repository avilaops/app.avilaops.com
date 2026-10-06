import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Confirmação de senha antes de ato sensível, e a conferência estrita de origem.
 *
 * O que estes testes seguram: sessão aberta não revela segredo sozinha, a
 * prova de um dono não serve a outro nem vira sessão, e pedido que não diz de
 * onde vem não passa em rota de segredo.
 */

const mock = vi.hoisted(() => ({
  admin: vi.fn(),
  cookie: vi.fn(),
  revelar: vi.fn(),
  auditar: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (nome: string) => mock.cookie(nome), set: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({
  getAdmin: mock.admin,
  ehDono: (role: string) => role === "OWNER",
}));
vi.mock("@/lib/credenciais", () => ({ revelarCredencial: mock.revelar }));
vi.mock("@/lib/prisma", () => ({
  prisma: { operationsAuditEvent: { create: mock.auditar }, adminIdentity: { findFirst: vi.fn() } },
}));

process.env.APP_JWT_SECRET ??= "segredo-de-teste";

const {
  assinarConfirmacao,
  confirmacaoValida,
  esperaPorFalhas,
  limparFalhas,
  registrarFalha,
} = await import("@/lib/confirmacao-recente");
const { origemEstrita } = await import("@/lib/http");
const { POST: revelar } = await import("@/app/api/credenciais/[chave]/revelar/route");

const pedido = (cabecalhos: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/credenciais/MP_ACCESS_TOKEN/revelar", {
    method: "POST",
    headers: { host: "localhost:3000", ...cabecalhos },
  });

describe("origem estrita", () => {
  it("aceita a própria origem", () => {
    expect(origemEstrita(pedido({ origin: "http://localhost:3000" }))).toBe(true);
  });

  it("recusa origem de outro endereço", () => {
    expect(origemEstrita(pedido({ origin: "https://outro.exemplo" }))).toBe(false);
  });

  it("recusa pedido que não diz de onde vem", () => {
    expect(origemEstrita(pedido())).toBe(false);
  });

  it("sem Origin, vale o Sec-Fetch-Site do navegador", () => {
    expect(origemEstrita(pedido({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(origemEstrita(pedido({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(origemEstrita(pedido({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});

describe("prova de confirmação", () => {
  it("vale para quem confirmou e só para ele", () => {
    const prova = assinarConfirmacao("dono");
    expect(confirmacaoValida(prova, "dono")).toBe(true);
    expect(confirmacaoValida(prova, "outro")).toBe(false);
  });

  it("recusa ausente, adulterada e vencida", () => {
    expect(confirmacaoValida(undefined, "dono")).toBe(false);
    expect(confirmacaoValida(`${assinarConfirmacao("dono")}x`, "dono")).toBe(false);
    const vencida = jwt.sign({ sub: "dono" }, process.env.APP_JWT_SECRET!, {
      audience: "confirmacao-de-senha",
      expiresIn: -10,
    });
    expect(confirmacaoValida(vencida, "dono")).toBe(false);
  });

  it("cookie de sessão não serve de prova", () => {
    // Mesmo segredo, mesma conta: o que separa os dois é a audiência.
    const sessao = jwt.sign({ sub: "dono", role: "OWNER" }, process.env.APP_JWT_SECRET!, { expiresIn: 3600 });
    expect(confirmacaoValida(sessao, "dono")).toBe(false);
  });
});

describe("limite de senha errada", () => {
  const AGORA = 1_000_000;

  it("bloqueia na quinta falha e libera depois da janela", () => {
    limparFalhas("dono");
    for (let i = 0; i < 4; i += 1) registrarFalha("dono", AGORA);
    expect(esperaPorFalhas("dono", AGORA)).toBe(0);

    registrarFalha("dono", AGORA);
    expect(esperaPorFalhas("dono", AGORA)).toBe(15 * 60);
    expect(esperaPorFalhas("dono", AGORA + 15 * 60 * 1000)).toBe(0);
  });

  it("falha depois do bloqueio vencido recomeça a contagem", () => {
    limparFalhas("dono");
    for (let i = 0; i < 5; i += 1) registrarFalha("dono", AGORA);
    const depois = AGORA + 16 * 60 * 1000;
    registrarFalha("dono", depois);
    expect(esperaPorFalhas("dono", depois)).toBe(0);
  });

  it("uma conta bloqueada não bloqueia a outra", () => {
    limparFalhas("dono");
    for (let i = 0; i < 5; i += 1) registrarFalha("dono", AGORA);
    expect(esperaPorFalhas("outro", AGORA)).toBe(0);
  });
});

describe("revelar credencial", () => {
  const contexto = () => ({ params: Promise.resolve({ chave: "MP_ACCESS_TOKEN" }) });
  const daNossaTela = { origin: "http://localhost:3000" };

  beforeEach(() => {
    vi.resetAllMocks();
    mock.admin.mockResolvedValue({ id: "dono", role: "OWNER" });
    mock.revelar.mockResolvedValue("valor-em-claro");
    mock.auditar.mockResolvedValue({});
  });

  it("sem confirmação recente, pede a senha e não lê o cofre", async () => {
    mock.cookie.mockReturnValue(undefined);
    const resposta = await revelar(pedido(daNossaTela), contexto());

    expect(resposta.status).toBe(403);
    expect((await resposta.json()).codigo).toBe("CONFIRMACAO_NECESSARIA");
    expect(mock.revelar).not.toHaveBeenCalled();
    expect(mock.auditar).not.toHaveBeenCalled();
  });

  it("com confirmação recente, revela e audita", async () => {
    mock.cookie.mockReturnValue({ value: assinarConfirmacao("dono") });
    const resposta = await revelar(pedido(daNossaTela), contexto());

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ chave: "MP_ACCESS_TOKEN", valor: "valor-em-claro" });
    expect(mock.auditar).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PLATFORM_CREDENTIAL_REVEALED", actorId: "dono" }),
    });
  });

  it("confirmação de outra conta não abre o cofre", async () => {
    mock.cookie.mockReturnValue({ value: assinarConfirmacao("outro") });
    const resposta = await revelar(pedido(daNossaTela), contexto());

    expect(resposta.status).toBe(403);
    expect(mock.revelar).not.toHaveBeenCalled();
  });

  it("pedido de fora da nossa tela é recusado antes de tudo", async () => {
    mock.cookie.mockReturnValue({ value: assinarConfirmacao("dono") });
    const resposta = await revelar(pedido({ origin: "https://outro.exemplo" }), contexto());

    expect(resposta.status).toBe(403);
    expect((await resposta.json()).codigo).toBeUndefined();
    expect(mock.revelar).not.toHaveBeenCalled();
  });

  it("sócio não revela, com ou sem confirmação", async () => {
    mock.admin.mockResolvedValue({ id: "socio", role: "SOCIO" });
    mock.cookie.mockReturnValue({ value: assinarConfirmacao("socio") });
    const resposta = await revelar(pedido(daNossaTela), contexto());

    expect(resposta.status).toBe(403);
    expect(mock.revelar).not.toHaveBeenCalled();
  });
});
