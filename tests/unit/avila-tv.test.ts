import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O cliente HTTP do agente: o que conta como "agente fora do ar".
 *
 * O agente mora num PC atrás de túnel. O caso mais comum de queda não é o
 * timeout, é a Cloudflare respondendo 502/521/530 no lugar dele; isso tem que
 * cair no mesmo estado que o timeout, e não virar "o agente respondeu 530".
 */
vi.mock("server-only", () => ({}));

const respostas: Array<() => Promise<Response>> = [];

beforeEach(() => {
  process.env.AVILA_TV_API_KEY = "chave-de-teste";
  respostas.length = 0;
  vi.stubGlobal("fetch", vi.fn(() => (respostas.shift() ?? (() => Promise.reject(new Error("sem resposta"))))()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AVILA_TV_API_KEY;
});

const json = (status: number, corpo: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }));

describe("cliente do agente Ávila TV", () => {
  it.each([502, 521, 530])("resposta %i da borda é agente indisponível", async (status) => {
    const { AgenteIndisponivel, revogarTela } = await import("@/lib/avila-tv");
    respostas.push(() => Promise.resolve(new Response("<html>Cloudflare</html>", { status })));
    const erro = await revogarTela("cozinha").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(AgenteIndisponivel);
    expect((erro as Error).message).toContain(String(status));
  });

  it("a recusa do protocolo (409) chega com a frase e o código", async () => {
    const { AgenteIndisponivel, enviarComando } = await import("@/lib/avila-tv");
    respostas.push(json(409, { error: "dispositivo_desconectado: Salão", erro: "dispositivo_desconectado" }));
    const erro = (await enviarComando("salao", "recarregar").catch((e: unknown) => e)) as Error;
    expect(erro).not.toBeInstanceOf(AgenteIndisponivel);
    expect(erro.message).toBe("dispositivo_desconectado: Salão");
    expect(erro.name).toBe("dispositivo_desconectado");
  });

  it("chave recusada é agente indisponível, com o nome da variável", async () => {
    const { AgenteIndisponivel, revogarTela } = await import("@/lib/avila-tv");
    respostas.push(json(401, { error: "login" }));
    const erro = (await revogarTela("cozinha").catch((e: unknown) => e)) as Error;
    expect(erro).toBeInstanceOf(AgenteIndisponivel);
    expect(erro.message).toContain("AVILA_TV_API_KEY");
  });

  it("a chave vai no cabeçalho e o corpo segue o formato da rota do agente", async () => {
    const { enviarComando } = await import("@/lib/avila-tv");
    respostas.push(json(200, { ok: true, resultado: { id: "c-1", ok: true, msg: "exibindo aviso" } }));
    await enviarComando("cozinha", "mensagem", { texto: "Fechamos às 22h" });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tv.avilaops.com/api/link/comando");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("chave-de-teste");
    expect(JSON.parse(String(init.body))).toEqual({ dispositivo: "cozinha", comando: "mensagem", params: { texto: "Fechamos às 22h" } });
  });

  it("a saúde que falha não derruba a lista de telas", async () => {
    const { lerPainelDeTelas } = await import("@/lib/avila-tv");
    respostas.push(json(200, { dispositivos: 0, online: 0, aguardando_pareamento: 0, origens_padrao: [], telas: [], pendentes: [] }));
    respostas.push(() => Promise.resolve(new Response("", { status: 530 })));
    const painel = await lerPainelDeTelas(7);
    expect(painel.link.telas).toEqual([]);
    expect(painel.saude).toBeNull();
  });
});
