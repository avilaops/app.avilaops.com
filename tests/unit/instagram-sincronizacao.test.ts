import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Releitura do perfil do Instagram, com Postgres, cifra e rede dublados.
 *
 * O que importa aqui é o contrato com a tela: ou o número é relido e ganha
 * data, ou o erro fica gravado onde a tela consegue mostrar. O caminho que não
 * pode existir é o terceiro — falhar e a tela seguir exibindo o número velho
 * como se fosse de agora.
 */

const conexaoUnica = vi.fn();
const atualizarConexao = vi.fn();
const upsertConta = vi.fn();
const criarEvento = vi.fn();

vi.mock("@/lib/prisma", () => {
  const cliente = {
    organizationIntegrationConnection: {
      get findUnique() {
        return conexaoUnica;
      },
      get update() {
        return atualizarConexao;
      },
    },
    instagramAccount: {
      get upsert() {
        return upsertConta;
      },
    },
    operationsAuditEvent: {
      get create() {
        return criarEvento;
      },
    },
    $transaction: (executar: (t: unknown) => unknown) => executar(cliente),
  };
  return { prisma: cliente };
});

vi.mock("@/lib/token-de-conexao", () => ({
  cifrarToken: (valor: string) => `cifrado:${valor}`,
  decifrarToken: (valor: string) => valor.replace(/^cifrado:/, ""),
}));

vi.mock("@/lib/credenciais", () => ({
  obterCredencial: async () => null,
  exigirCredencial: async () => "irrelevante-neste-teste",
}));

const { sincronizarInstagram } = await import("@/lib/instagram");

const PERFIL = {
  id: "17841400000000001",
  user_id: "17841400000000001",
  username: "clinicahorizonte",
  name: "Clínica Horizonte",
  account_type: "BUSINESS",
  followers_count: 3187,
  media_count: 214,
};

function responde(corpo: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => corpo } as unknown as Response;
}

describe("sincronizarInstagram", () => {
  beforeEach(() => {
    conexaoUnica.mockReset().mockResolvedValue({ id: "con-a", tokenCiphertext: "cifrado:tok-1" });
    atualizarConexao.mockReset().mockResolvedValue({});
    upsertConta.mockReset().mockResolvedValue({});
    criarEvento.mockReset().mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responde(PERFIL)));
  });

  it("relê o perfil e devolve o número com a hora da leitura", async () => {
    const resultado = await sincronizarInstagram("admin-1", "org-a");

    expect(resultado).toMatchObject({
      conta: "clinicahorizonte",
      seguidores: 3187,
      publicacoes: 214,
    });
    // Sem data, o número na tela não teria procedência.
    expect(Number.isNaN(new Date(resultado.lidoEm).getTime())).toBe(false);
  });

  it("manda o token no pedido, e o token vai decifrado", async () => {
    await sincronizarInstagram("admin-1", "org-a");

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("graph.instagram.com");
    expect(String(url)).toContain("access_token=tok-1");
  });

  it("grava seguidores, publicações e a hora na conta", async () => {
    await sincronizarInstagram("admin-1", "org-a");

    expect(upsertConta).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instagramAccountId: "17841400000000001" },
        update: expect.objectContaining({
          username: "clinicahorizonte",
          followersCount: 3187,
          mediaCount: 214,
          lastSyncedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("registra a sincronização na auditoria, sem token", async () => {
    await sincronizarInstagram("admin-1", "org-a");

    const [[evento]] = criarEvento.mock.calls;
    expect(evento.data).toMatchObject({
      actorId: "admin-1",
      organizationId: "org-a",
      action: "INSTAGRAM_ACCOUNT_SYNCED",
      metadata: { conta: "clinicahorizonte", seguidores: 3187, publicacoes: 214 },
    });
    expect(JSON.stringify(evento)).not.toContain("tok-1");
  });

  it("falha da Meta fica gravada na conexão, e não vira número velho na tela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responde({ error: { message: "Token inválido" } }, false, 400)),
    );

    await expect(sincronizarInstagram("admin-1", "org-a")).rejects.toThrow("Token inválido");

    expect(atualizarConexao).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "con-a" },
        data: expect.objectContaining({
          lastSyncStatus: "SYNC_FAILED",
          lastSyncError: expect.stringContaining("Token inválido"),
        }),
      }),
    );
    // Nada de conta ou auditoria: leitura que falhou não grava número.
    expect(upsertConta).not.toHaveBeenCalled();
    expect(criarEvento).not.toHaveBeenCalled();
  });

  it("cliente sem Instagram conectado recusa antes de ir à rede", async () => {
    conexaoUnica.mockResolvedValue(null);

    await expect(sincronizarInstagram("admin-1", "org-z")).rejects.toThrow("não conectado");
    expect(fetch).not.toHaveBeenCalled();
  });
});
