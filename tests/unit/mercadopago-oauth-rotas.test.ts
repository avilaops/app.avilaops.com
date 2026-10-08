import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  admin: vi.fn(),
  confirmou: vi.fn(),
  cookie: vi.fn(),
  porCookie: vi.fn(),
  tirarCookie: vi.fn(),
  aplicacao: vi.fn(),
  trocar: vi.fn(),
  guardar: vi.fn(),
  auditar: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAdmin: m.admin, ehDono: (papel: string) => papel === "OWNER" }));
vi.mock("@/lib/prisma", () => ({ prisma: { operationsAuditEvent: { create: m.auditar } } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: m.cookie, set: m.porCookie, delete: m.tirarCookie }),
}));
vi.mock("@/lib/confirmacao-recente", () => ({
  temConfirmacaoRecente: m.confirmou,
  pedirConfirmacao: () => Response.json({ codigo: "CONFIRMACAO_NECESSARIA" }, { status: 403 }),
}));
vi.mock("@/lib/mercadopago-oauth", () => {
  class MercadoPagoOAuthErro extends Error {}
  return {
    COOKIE_DE_ESTADO: "avila_ops_mp_oauth",
    VALIDADE_DO_ESTADO_SEGUNDOS: 600,
    FICHA: "/empresa/credenciais/financeiro/mercado-pago",
    MercadoPagoOAuthErro,
    assinarEstado: (id: string) => `estado.${id}`,
    estadoValido: (estado: string | null, id: string) => estado === `estado.${id}`,
    credenciaisDaAplicacao: m.aplicacao,
    urlDeAutorizacao: (clientId: string, estado: string) => `https://mp.exemplo/autorizar?c=${clientId}&s=${estado}`,
    trocarCodigo: m.trocar,
    guardarConexao: m.guardar,
  };
});

import { GET } from "@/app/api/empresa/mercadopago/oauth/callback/route";
import { POST } from "@/app/api/empresa/mercadopago/oauth/start/route";
import { MercadoPagoOAuthErro } from "@/lib/mercadopago-oauth";

const BASE = "https://app.avilaops.com";
// `host` vai explícito: é com ele que a rota compara o `Origin`.
const comecar = (cabecalhos: Record<string, string> = { origin: BASE }) =>
  new NextRequest(`${BASE}/api/empresa/mercadopago/oauth/start`, {
    method: "POST",
    headers: { host: "app.avilaops.com", ...cabecalhos },
  });
const voltar = (query = "state=estado.dono&code=codigo") =>
  new NextRequest(`${BASE}/api/empresa/mercadopago/oauth/callback?${query}`);
const destino = (resposta: Response) => new URL(resposta.headers.get("location")!);

const token = {
  accessToken: "APP_USR-x",
  refreshToken: "TG-x",
  publicKey: null,
  userId: "123456",
  expiraEm: new Date("2027-04-06T00:00:00Z"),
  producao: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = BASE;
  m.admin.mockResolvedValue({ id: "dono", role: "OWNER" });
  m.confirmou.mockResolvedValue(true);
  m.aplicacao.mockResolvedValue({ clientId: "111", clientSecret: "s" });
  m.cookie.mockReturnValue({ value: "estado.dono" });
  m.trocar.mockResolvedValue(token);
});

describe("começo da conexão", () => {
  it("devolve o endereço do Mercado Pago e prende o state num cookie", async () => {
    const resposta = await POST(comecar());
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ url: "https://mp.exemplo/autorizar?c=111&s=estado.dono" });
    expect(m.porCookie).toHaveBeenCalledWith(
      "avila_ops_mp_oauth",
      "estado.dono",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/api/empresa/mercadopago/oauth" }),
    );
  });

  it("só o dono começa", async () => {
    m.admin.mockResolvedValue({ id: "socio", role: "ADMIN" });
    expect((await POST(comecar())).status).toBe(403);
    m.admin.mockResolvedValue(null);
    expect((await POST(comecar())).status).toBe(401);
    expect(m.porCookie).not.toHaveBeenCalled();
  });

  it("pedido sem origem não passa", async () => {
    expect((await POST(comecar({}))).status).toBe(403);
    expect((await POST(comecar({ origin: "https://outro.exemplo" }))).status).toBe(403);
  });

  it("pede a senha de novo antes de trocar a conta que recebe", async () => {
    m.confirmou.mockResolvedValue(false);
    const resposta = await POST(comecar());
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ codigo: "CONFIRMACAO_NECESSARIA" });
  });

  it("sem Client Secret diz o que falta, e não manda ninguém ao Mercado Pago", async () => {
    m.aplicacao.mockResolvedValue({ clientId: "111", clientSecret: "" });
    const resposta = await POST(comecar());
    expect(resposta.status).toBe(409);
    expect(m.porCookie).not.toHaveBeenCalled();
  });
});

describe("volta do Mercado Pago", () => {
  it("guarda a conexão, deixa rastro com a conta e sem o token", async () => {
    const resposta = await GET(voltar());
    expect(destino(resposta).pathname).toBe("/empresa/credenciais/financeiro/mercado-pago");
    expect(destino(resposta).searchParams.get("conectado")).toBe("1");
    expect(m.guardar).toHaveBeenCalledWith(token, "dono", "oauth:conexao");
    const evento = m.auditar.mock.calls[0][0].data;
    expect(evento).toMatchObject({ action: "MERCADO_PAGO_CONECTADO_POR_OAUTH", actorId: "dono" });
    expect(JSON.stringify(evento)).not.toContain("APP_USR-x");
    expect(JSON.stringify(evento)).not.toContain("TG-x");
  });

  it.each([
    ["sem cookie", () => m.cookie.mockReturnValue(undefined)],
    ["state diferente do cookie", () => m.cookie.mockReturnValue({ value: "estado.outro" })],
    ["state de outro dono", () => m.admin.mockResolvedValue({ id: "outro", role: "OWNER" })],
  ])("recusa %s e gasta o cookie", async (_nome, preparar) => {
    preparar();
    const resposta = await GET(voltar());
    expect(destino(resposta).searchParams.has("erro")).toBe(true);
    expect(m.trocar).not.toHaveBeenCalled();
    expect(m.tirarCookie).toHaveBeenCalledOnce();
  });

  it("quem não é dono não conclui", async () => {
    m.admin.mockResolvedValue({ id: "dono", role: "ADMIN" });
    expect(destino(await GET(voltar())).pathname).toBe("/mais");
    m.admin.mockResolvedValue(null);
    expect(destino(await GET(voltar())).pathname).toBe("/login");
    expect(m.trocar).not.toHaveBeenCalled();
  });

  it("autorização negada no Mercado Pago não troca código nenhum", async () => {
    const resposta = await GET(voltar("state=estado.dono&error=access_denied"));
    expect(destino(resposta).searchParams.has("erro")).toBe(true);
    expect(m.trocar).not.toHaveBeenCalled();
  });

  it("token de teste não vira o token que cobra", async () => {
    m.trocar.mockResolvedValue({ ...token, producao: false });
    const resposta = await GET(voltar());
    expect(destino(resposta).searchParams.get("erro")).toContain("teste");
    expect(m.guardar).not.toHaveBeenCalled();
    expect(m.auditar).not.toHaveBeenCalled();
  });

  it("o motivo da recusa do Mercado Pago chega à tela; erro desconhecido não vaza", async () => {
    m.trocar.mockRejectedValue(new MercadoPagoOAuthErro("recusou (400 — invalid_grant)"));
    expect(destino(await GET(voltar())).searchParams.get("erro")).toContain("invalid_grant");
    m.trocar.mockRejectedValue(new Error("ECONNRESET em 10.0.0.1 com segredo"));
    expect(destino(await GET(voltar())).searchParams.get("erro")).toBe(
      "Não consegui concluir a conexão com o Mercado Pago.",
    );
  });
});
