import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As três rotas de ação das telas, com o agente e o banco dublados.
 *
 * O que se protege aqui é o que é desta camada e não do agente: quem pode
 * mandar o quê, o que chega bem formado até ele, e que a auditoria que falha
 * depois de a ação acontecer não vira um erro que faz o operador repetir.
 */
const estado = vi.hoisted(() => ({
  papel: "OWNER" as string | null,
  configurado: true,
  auditoriaFalha: false,
  agente: {
    enviarComando: vi.fn(),
    parearTela: vi.fn(),
    revogarTela: vi.fn(),
  },
  auditados: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth", () => ({
  getAdmin: async () =>
    estado.papel ? { id: "conta-1", nome: "Nicolas Ávila", email: "nicolas@avilaops.com", role: estado.papel } : null,
  ehDono: (role: string) => role === "OWNER",
}));

vi.mock("@/lib/avila-tv", () => {
  class AgenteIndisponivel extends Error {}
  return {
    AgenteIndisponivel,
    agenteConfigurado: () => estado.configurado,
    enviarComando: (...a: unknown[]) => estado.agente.enviarComando(...a),
    parearTela: (...a: unknown[]) => estado.agente.parearTela(...a),
    revogarTela: (...a: unknown[]) => estado.agente.revogarTela(...a),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operationsAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (estado.auditoriaFalha) throw new Error("banco fora");
        estado.auditados.push(data);
        return data;
      },
    },
  },
}));

const pedido = (rota: string, corpo: unknown, origem = "http://localhost:3000") =>
  new NextRequest(`http://localhost:3000/api/telas/${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", origin: origem },
    body: JSON.stringify(corpo),
  });

const rotas = {
  comando: () => import("@/app/api/telas/comando/route"),
  parear: () => import("@/app/api/telas/parear/route"),
  revogar: () => import("@/app/api/telas/revogar/route"),
};

async function chamar(rota: keyof typeof rotas, corpo: unknown, origem?: string) {
  const { POST } = await rotas[rota]();
  const resposta = (await POST(pedido(rota, corpo, origem))) as Response;
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

const tela = { id: "cozinha", nome: "Tela da cozinha", tenant: "brasa" };

beforeEach(() => {
  estado.papel = "OWNER";
  estado.configurado = true;
  estado.auditoriaFalha = false;
  estado.auditados = [];
  estado.agente.enviarComando.mockReset().mockResolvedValue({ ok: true, resultado: { id: "c-1", ok: true, msg: "recarregado" } });
  estado.agente.parearTela.mockReset().mockResolvedValue({ ok: true, dispositivo: tela });
  estado.agente.revogarTela.mockReset().mockResolvedValue({ ok: true, dispositivo: tela });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("quem pode o quê", () => {
  it("sem sessão, nada sai para o agente", async () => {
    estado.papel = null;
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" });
    expect(r.status).toBe(401);
    expect(estado.agente.enviarComando).not.toHaveBeenCalled();
  });

  it("pedido de outra origem é recusado antes de chegar ao agente", async () => {
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" }, "https://evil.example");
    expect(r.status).toBe(403);
    expect(estado.agente.enviarComando).not.toHaveBeenCalled();
  });

  /**
   * Revogar apaga o token e não tem volta. O irreversível fica atrás de
   * `ehDono()`: o sócio opera as telas, mas não aposenta uma.
   */
  it("o sócio recarrega, mas não revoga", async () => {
    estado.papel = "SOCIO";
    expect((await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" })).status).toBe(200);
    const r = await chamar("revogar", { dispositivo: "cozinha" });
    expect(r.status).toBe(403);
    expect(estado.agente.revogarTela).not.toHaveBeenCalled();
  });

  it("o dono revoga, e fica o rastro de quem foi", async () => {
    const r = await chamar("revogar", { dispositivo: "cozinha" });
    expect(r.status).toBe(200);
    expect(estado.agente.revogarTela).toHaveBeenCalledWith("cozinha");
    expect(estado.auditados).toEqual([
      expect.objectContaining({ action: "TV_SCREEN_REVOKED", entityId: "cozinha", actorId: "conta-1" }),
    ]);
  });

  it("sem a chave do agente, as ações dizem isso em vez de tentar", async () => {
    estado.configurado = false;
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" });
    expect(r.status).toBe(503);
    expect(estado.agente.enviarComando).not.toHaveBeenCalled();
  });
});

describe("comandos", () => {
  it.each(["exibir", "reiniciar", "dormir", "acordar", "dispositivo", "despareado", ""])(
    "recusa %s: não tem botão nesta página",
    async (comando) => {
      const r = await chamar("comando", { dispositivo: "cozinha", comando });
      expect(r.status).toBe(422);
      expect(estado.agente.enviarComando).not.toHaveBeenCalled();
    },
  );

  it("o aviso de 140 caracteres chega inteiro", async () => {
    const texto = "a".repeat(140);
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "mensagem", texto: `  ${texto}  ` });
    expect(r.status).toBe(200);
    expect(estado.agente.enviarComando).toHaveBeenCalledWith("cozinha", "mensagem", { texto });
  });

  /** Cortar em silêncio faria a tela mostrar uma frase que ninguém escreveu. */
  it("o aviso de 141 caracteres é recusado, não cortado", async () => {
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "mensagem", texto: "a".repeat(141) });
    expect(r.status).toBe(422);
    expect(r.corpo.error).toContain("140");
    expect(estado.agente.enviarComando).not.toHaveBeenCalled();
  });

  it("aviso vazio não sai", async () => {
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "mensagem", texto: "   " });
    expect(r.status).toBe(422);
  });

  it("o agente fora do ar vira 503, não 500", async () => {
    const { AgenteIndisponivel } = await import("@/lib/avila-tv");
    estado.agente.enviarComando.mockRejectedValue(new AgenteIndisponivel("Não consegui falar com o agente Ávila TV: o caminho até ele respondeu 530."));
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" });
    expect(r.status).toBe(503);
    expect(r.corpo.error).toContain("530");
  });

  it("a recusa do protocolo volta com o código, para a tela explicar", async () => {
    const recusa = new Error("dispositivo_desconectado: Tela da cozinha");
    recusa.name = "dispositivo_desconectado";
    estado.agente.enviarComando.mockRejectedValue(recusa);
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" });
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toBe("dispositivo_desconectado");
    expect(estado.auditados).toEqual([]);
  });

  /**
   * A tela já recarregou quando o banco falha. Devolver erro aqui faria o
   * operador repetir o que deu certo.
   */
  it("auditoria que falha depois da ação não transforma sucesso em erro", async () => {
    estado.auditoriaFalha = true;
    const r = await chamar("comando", { dispositivo: "cozinha", comando: "recarregar" });
    expect(r.status).toBe(200);
    expect(r.corpo.auditoria).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("vincular", () => {
  it("aceita o código do alfabeto do protocolo e manda o nome limpo", async () => {
    const r = await chamar("parear", { codigo: "ktprwm", nome: "  Tela da cozinha  " });
    expect(r.status).toBe(200);
    expect(estado.agente.parearTela).toHaveBeenCalledWith("KTPRWM", "Tela da cozinha", []);
    expect(estado.auditados[0]).toEqual(expect.objectContaining({ action: "TV_SCREEN_PAIRED", entityId: "cozinha" }));
  });

  // O alfabeto do protocolo (`ALFABETO_CODIGO`) é só de letras: algarismo
  // nunca aparece numa tela, então não deve passar daqui.
  it.each(["KTPRW2", "KTPRWI", "KTPRWO", "KTPRW", "KTPRWMM"])("recusa o código %s", async (codigo) => {
    const r = await chamar("parear", { codigo, nome: "Tela" });
    expect(r.status).toBe(422);
    expect(estado.agente.parearTela).not.toHaveBeenCalled();
  });

  it("recusa nome maior que o campo do formulário", async () => {
    const r = await chamar("parear", { codigo: "KTPRWM", nome: "x".repeat(61) });
    expect(r.status).toBe(422);
  });

  /**
   * Entrada que não é URL não casa com nada no agente, mas tira a tela da
   * allowlist herdada: todo `exibir` passaria a ser recusado sem explicação.
   */
  it("recusa allowlist com endereço que não é URL http(s)", async () => {
    for (const origens of [["brasa.comandeiro.com.br"], ["javascript:alert(1)"], ["ftp://x.example"], "https://x.example"]) {
      const r = await chamar("parear", { codigo: "KTPRWM", nome: "Tela", origens });
      expect(r.status).toBe(422);
    }
    expect(estado.agente.parearTela).not.toHaveBeenCalled();
  });

  it("aceita allowlist própria bem formada", async () => {
    const origens = ["https://brasa.comandeiro.com.br/tv", "http://10.0.0.5:8080"];
    const r = await chamar("parear", { codigo: "KTPRWM", nome: "Tela", origens });
    expect(r.status).toBe(200);
    expect(estado.agente.parearTela).toHaveBeenCalledWith("KTPRWM", "Tela", origens);
  });
});
