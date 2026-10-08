import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cofre = vi.hoisted(() => ({ valores: new Map<string, string>(), salvar: vi.fn() }));
vi.mock("@/lib/credenciais", () => ({
  obterCredencial: async (chave: string) => cofre.valores.get(chave) ?? null,
  salvarCredencial: cofre.salvar,
}));

import {
  assinarEstado,
  digitalDoToken,
  enderecoDeRetorno,
  estadoDaConexao,
  estadoValido,
  renovarTokenSeVencendo,
  trocarCodigo,
  urlDeAutorizacao,
  zerarMemoriaDaRenovacao,
} from "@/lib/mercadopago-oauth";

const DIA = 24 * 60 * 60 * 1000;
const respostaDoToken = (extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      access_token: "APP_USR-novo",
      refresh_token: "TG-novo",
      expires_in: 15552000,
      user_id: 123456,
      public_key: "APP_USR-pub",
      live_mode: true,
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

beforeEach(() => {
  process.env.APP_JWT_SECRET = "segredo-de-teste";
  process.env.APP_URL = "https://app.avilaops.com/";
  cofre.valores.clear();
  cofre.valores.set("MP_CLIENT_ID", "111");
  cofre.valores.set("MP_CLIENT_SECRET", "segredo-da-aplicacao");
  // O que é guardado passa a ser o que é lido, como no cofre de verdade.
  cofre.salvar.mockReset().mockImplementation(async (entrada: { chave: string; valor: string }) => {
    cofre.valores.set(entrada.chave, entrada.valor);
  });
  zerarMemoriaDaRenovacao();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("state da conexão", () => {
  it("vale para quem começou e para mais ninguém", () => {
    const estado = assinarEstado("dono-1");
    expect(estadoValido(estado, "dono-1")).toBe(true);
    expect(estadoValido(estado, "dono-2")).toBe(false);
  });

  it("recusa vazio, adulterado e assinado com outro segredo", () => {
    const estado = assinarEstado("dono-1");
    expect(estadoValido(null, "dono-1")).toBe(false);
    expect(estadoValido(`${estado}x`, "dono-1")).toBe(false);
    process.env.APP_JWT_SECRET = "outro-segredo";
    expect(estadoValido(estado, "dono-1")).toBe(false);
  });

  it("dois começos seguidos não geram o mesmo state", () => {
    expect(assinarEstado("dono-1")).not.toBe(assinarEstado("dono-1"));
  });
});

describe("endereços", () => {
  it("o retorno sai do APP_URL, sem barra dobrada", () => {
    expect(enderecoDeRetorno()).toBe("https://app.avilaops.com/api/empresa/mercadopago/oauth/callback");
  });

  it("a autorização leva client_id, state e o mesmo retorno da troca", () => {
    const url = new URL(urlDeAutorizacao("111", "estado-x"));
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com.br/authorization");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "111",
      response_type: "code",
      platform_id: "mp",
      state: "estado-x",
      redirect_uri: enderecoDeRetorno(),
    });
  });
});

describe("troca do código", () => {
  it("manda o segredo da aplicação no corpo e devolve o token com vencimento", async () => {
    const pedido = vi.fn(async () => respostaDoToken());
    vi.stubGlobal("fetch", pedido);

    const token = await trocarCodigo("codigo-1");

    const [endereco, init] = pedido.mock.calls[0] as unknown as [string, RequestInit];
    expect(endereco).toBe("https://api.mercadopago.com/oauth/token");
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "111",
      client_secret: "segredo-da-aplicacao",
      grant_type: "authorization_code",
      code: "codigo-1",
      redirect_uri: enderecoDeRetorno(),
    });
    expect(token).toMatchObject({ accessToken: "APP_USR-novo", refreshToken: "TG-novo", userId: "123456", producao: true });
    expect(token.expiraEm.getTime() - Date.now()).toBeGreaterThan(179 * DIA);
  });

  it("recusa do Mercado Pago vira erro com o motivo, sem o segredo", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: "invalid_grant", message: "code expirado" }), { status: 400 }),
    );
    const erro = await trocarCodigo("velho").catch((e: Error) => e);
    expect((erro as Error).message).toContain("invalid_grant");
    expect((erro as Error).message).not.toContain("segredo-da-aplicacao");
  });

  it("sem Client Secret nem chega a chamar o Mercado Pago", async () => {
    cofre.valores.delete("MP_CLIENT_SECRET");
    const pedido = vi.fn();
    vi.stubGlobal("fetch", pedido);
    await expect(trocarCodigo("codigo")).rejects.toThrow(/Client Secret/);
    expect(pedido).not.toHaveBeenCalled();
  });

  it("resposta sem refresh_token não vira conexão pela metade", async () => {
    vi.stubGlobal("fetch", async () => respostaDoToken({ refresh_token: undefined }));
    await expect(trocarCodigo("codigo")).rejects.toThrow(/sem token/);
  });
});

describe("renovação automática", () => {
  function conectado(venceEmDias: number) {
    cofre.valores.set("MP_ACCESS_TOKEN", "APP_USR-atual");
    cofre.valores.set("MP_REFRESH_TOKEN", "TG-atual");
    cofre.valores.set("MP_OAUTH_DIGITAL", digitalDoToken("APP_USR-atual"));
    cofre.valores.set("MP_OAUTH_EXPIRA_EM", new Date(Date.now() + venceEmDias * DIA).toISOString());
    cofre.valores.set("MP_OAUTH_USER_ID", "123456");
  }

  it("longe do vencimento não chama ninguém", async () => {
    conectado(90);
    const pedido = vi.fn();
    vi.stubGlobal("fetch", pedido);
    await renovarTokenSeVencendo();
    expect(pedido).not.toHaveBeenCalled();
  });

  it("perto do vencimento troca o token e guarda o refresh novo", async () => {
    conectado(10);
    const pedido = vi.fn(async () => respostaDoToken());
    vi.stubGlobal("fetch", pedido);
    vi.spyOn(console, "info").mockImplementation(() => {});

    await renovarTokenSeVencendo();

    const [, init] = pedido.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ grant_type: "refresh_token", refresh_token: "TG-atual" });
    expect(cofre.valores.get("MP_ACCESS_TOKEN")).toBe("APP_USR-novo");
    expect(cofre.valores.get("MP_REFRESH_TOKEN")).toBe("TG-novo");
    expect(cofre.valores.get("MP_OAUTH_DIGITAL")).toBe(digitalDoToken("APP_USR-novo"));
  });

  it("token colado à mão depois da conexão NÃO é trocado pelo renovado da conta antiga", async () => {
    conectado(10);
    cofre.valores.set("MP_ACCESS_TOKEN", "APP_USR-de-outra-conta");
    const pedido = vi.fn();
    vi.stubGlobal("fetch", pedido);

    await renovarTokenSeVencendo();

    expect(pedido).not.toHaveBeenCalled();
    expect(cofre.valores.get("MP_ACCESS_TOKEN")).toBe("APP_USR-de-outra-conta");
    expect(await estadoDaConexao()).toMatchObject({ conectada: false, substituidaAMao: true, userId: null });
  });

  it("chamadas simultâneas fazem uma renovação só", async () => {
    conectado(10);
    const pedido = vi.fn(async () => respostaDoToken());
    vi.stubGlobal("fetch", pedido);
    vi.spyOn(console, "info").mockImplementation(() => {});

    await Promise.all([renovarTokenSeVencendo(), renovarTokenSeVencendo(), renovarTokenSeVencendo()]);

    expect(pedido).toHaveBeenCalledTimes(1);
  });

  it("falha não lança, mantém o token e só tenta de novo depois de uma hora", async () => {
    conectado(10);
    const pedido = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    vi.stubGlobal("fetch", pedido);
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const agora = Date.now();

    await expect(renovarTokenSeVencendo(agora)).resolves.toBeUndefined();
    await renovarTokenSeVencendo(agora + 10 * 60 * 1000);
    expect(pedido).toHaveBeenCalledTimes(1);
    expect(cofre.valores.get("MP_ACCESS_TOKEN")).toBe("APP_USR-atual");
    expect(String(erroNoLog.mock.calls[0][0])).toContain("RENOVAÇÃO FALHOU");

    await renovarTokenSeVencendo(agora + 61 * 60 * 1000);
    expect(pedido).toHaveBeenCalledTimes(2);
  });

  it("sem conexão por OAuth, o token colado segue como está", async () => {
    cofre.valores.set("MP_ACCESS_TOKEN", "APP_USR-colado");
    const pedido = vi.fn();
    vi.stubGlobal("fetch", pedido);
    await renovarTokenSeVencendo();
    expect(pedido).not.toHaveBeenCalled();
    expect(await estadoDaConexao()).toMatchObject({ aplicacaoPronta: true, conectada: false, substituidaAMao: false });
  });
});

describe("estado mostrado na tela", () => {
  it("diz o que falta da aplicação", async () => {
    cofre.valores.delete("MP_CLIENT_SECRET");
    expect(await estadoDaConexao()).toMatchObject({ aplicacaoPronta: false, faltam: ["Client Secret"] });
  });
});
