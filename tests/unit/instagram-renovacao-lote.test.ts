import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A rodada inteira, com o Postgres e a Meta trocados por dublês.
 *
 * O que está sob teste aqui não é a regra da janela (isso é
 * `instagram-renovacao.test.ts`), e sim o comportamento que só aparece com
 * vários clientes: a falha de um não pode levar os outros junto, e o que
 * aconteceu com cada um precisa virar evento de auditoria. É a diferença entre
 * "um cliente ficou sem Instagram" e "todos ficaram".
 */

const conexoes = vi.fn();
const atualizar = vi.fn();
const criarEvento = vi.fn();
const renovarUm = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationIntegrationConnection: {
      get findMany() {
        return conexoes;
      },
      get update() {
        return atualizar;
      },
    },
    operationsAuditEvent: {
      get create() {
        return criarEvento;
      },
    },
  },
}));

vi.mock("@/lib/instagram", () => ({
  INSTAGRAM_PROVIDER: "instagram_login",
  get renovarTokenInstagram() {
    return renovarUm;
  },
}));

const { renovarTokensDoInstagram } = await import("@/lib/instagram-renovacao");

const AGORA = new Date("2026-09-19T03:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1_000;

function conexao(id: string, dias: number | null, conta = id) {
  return {
    id: `con-${id}`,
    organizationId: `org-${id}`,
    accountName: conta,
    status: "ACTIVE",
    tokenCiphertext: "iv.tag.payload",
    tokenExpiresAt: dias === null ? null : new Date(AGORA.getTime() + dias * DIA_MS),
  };
}

function acoes(action: string) {
  return criarEvento.mock.calls.filter(([arg]) => arg.data.action === action);
}

describe("rodada de renovação do Instagram", () => {
  beforeEach(() => {
    conexoes.mockReset();
    atualizar.mockReset().mockResolvedValue({});
    criarEvento.mockReset().mockResolvedValue({});
    renovarUm.mockReset();
  });

  it("o cliente que falha não leva os outros junto", async () => {
    conexoes.mockResolvedValue([conexao("a", 3), conexao("b", 2), conexao("c", 1)]);
    renovarUm
      .mockResolvedValueOnce({ tokenExpiresAt: new Date(AGORA.getTime() + 60 * DIA_MS) })
      .mockRejectedValueOnce(new Error("Instagram: token revogado pelo usuário"))
      .mockResolvedValueOnce({ tokenExpiresAt: new Date(AGORA.getTime() + 60 * DIA_MS) });

    const relatorio = await renovarTokensDoInstagram({ agora: AGORA });

    expect(renovarUm).toHaveBeenCalledTimes(3);
    expect(relatorio.renovadas).toBe(2);
    expect(relatorio.falhas).toBe(1);
    expect(relatorio.conexoes.map((c) => c.desfecho)).toEqual(["RENOVADO", "FALHOU", "RENOVADO"]);
  });

  it("grava o motivo da falha na própria conexão, para a tela poder dizer", async () => {
    conexoes.mockResolvedValue([conexao("a", 2)]);
    renovarUm.mockRejectedValue(new Error("Instagram: token revogado pelo usuário"));

    const relatorio = await renovarTokensDoInstagram({ agora: AGORA });

    expect(atualizar).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "con-a" },
        data: expect.objectContaining({
          lastSyncStatus: "REFRESH_FAILED",
          lastSyncError: "Instagram: token revogado pelo usuário",
        }),
      }),
    );
    expect(relatorio.conexoes[0].erro).toBe("Instagram: token revogado pelo usuário");
    expect(acoes("INSTAGRAM_TOKEN_RENEWAL_FAILED")).toHaveLength(1);
  });

  it("token vencido vira EXPIRED e não chega a bater na Meta", async () => {
    conexoes.mockResolvedValue([conexao("velho", -1)]);

    const relatorio = await renovarTokensDoInstagram({ agora: AGORA });

    // Chamar a Meta com token vencido só devolve erro: ela não renova vencido.
    expect(renovarUm).not.toHaveBeenCalled();
    expect(atualizar).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "EXPIRED", lastSyncStatus: "TOKEN_EXPIRED" }),
      }),
    );
    expect(relatorio.vencidas).toBe(1);
    expect(acoes("INSTAGRAM_TOKEN_EXPIRED")).toHaveLength(1);
  });

  it("não reescreve conexão que já está marcada como vencida", async () => {
    // Sem isto, todo dia a rodada gravaria o mesmo evento de auditoria para o
    // mesmo cliente, e a trilha viraria ruído.
    conexoes.mockResolvedValue([{ ...conexao("velho", -30), status: "EXPIRED" }]);

    const relatorio = await renovarTokensDoInstagram({ agora: AGORA });

    expect(atualizar).not.toHaveBeenCalled();
    expect(criarEvento).not.toHaveBeenCalled();
    expect(relatorio.vencidas).toBe(1);
  });

  it("quem está em dia não é tocado", async () => {
    conexoes.mockResolvedValue([conexao("tranquilo", 45)]);

    const relatorio = await renovarTokensDoInstagram({ agora: AGORA });

    expect(renovarUm).not.toHaveBeenCalled();
    expect(atualizar).not.toHaveBeenCalled();
    expect(relatorio.semAcao).toBe(1);
    expect(relatorio.renovadas).toBe(0);
  });

  it("cada renovação grava auditoria com a validade velha e a nova", async () => {
    conexoes.mockResolvedValue([conexao("a", 4, "clinicahorizonte")]);
    const nova = new Date(AGORA.getTime() + 60 * DIA_MS);
    renovarUm.mockResolvedValue({ tokenExpiresAt: nova });

    await renovarTokensDoInstagram({ agora: AGORA, actorId: "admin-1" });

    const [[evento]] = acoes("INSTAGRAM_TOKEN_RENEWED");
    expect(evento.data).toMatchObject({
      actorId: "admin-1",
      organizationId: "org-a",
      entityType: "OrganizationIntegrationConnection",
      entityId: "con-a",
      metadata: {
        conta: "clinicahorizonte",
        expiravaEm: new Date(AGORA.getTime() + 4 * DIA_MS).toISOString(),
        expiraEm: nova.toISOString(),
      },
    });
  });

  it("a rodada do agendador não inventa um autor", async () => {
    conexoes.mockResolvedValue([conexao("a", 4)]);
    renovarUm.mockResolvedValue({ tokenExpiresAt: new Date(AGORA.getTime() + 60 * DIA_MS) });

    await renovarTokensDoInstagram({ agora: AGORA });

    const [[evento]] = acoes("INSTAGRAM_TOKEN_RENEWED");
    expect(evento.data.actorId).toBeNull();
  });

  it("um cliente só: a rodada não vasculha o parque inteiro", async () => {
    conexoes.mockResolvedValue([]);

    await renovarTokensDoInstagram({ agora: AGORA, organizationId: "org-x" });

    expect(conexoes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: "instagram_login", organizationId: "org-x" },
      }),
    );
  });
});
