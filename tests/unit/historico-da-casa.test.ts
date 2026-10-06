import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Histórico da configuração da casa.
 *
 * A aba mostra o registro de auditoria em frase. O que não pode acontecer:
 * evento de outra área do painel aparecer aqui, ou a frase carregar valor de
 * segredo.
 */

const mock = vi.hoisted(() => ({ eventos: vi.fn(), autores: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    operationsAuditEvent: { findMany: mock.eventos },
    adminIdentity: { findMany: mock.autores },
  },
}));

const { ACOES_DA_CASA, descreverEvento, historicoDaCasa } = await import("@/lib/historico-da-casa");

describe("descrição do evento", () => {
  it("certificado enviado diz o titular e a validade", () => {
    expect(
      descreverEvento({
        action: "CERTIFICADO_DA_CASA_ENVIADO",
        entityId: "casa",
        metadata: { titular: "AVILA OPS LTDA", cnpj: "11222333000181", validoAte: "2027-03-15T12:00:00.000Z" },
      }),
    ).toEqual({
      titulo: "Certificado digital enviado",
      detalhe: "AVILA OPS LTDA · válido até 15/03/2027",
      atencao: false,
    });
  });

  it("credencial revelada pede atenção e nomeia a chave", () => {
    expect(
      descreverEvento({ action: "PLATFORM_CREDENTIAL_REVEALED", entityId: "MP_ACCESS_TOKEN", metadata: null }),
    ).toEqual({ titulo: "Credencial revelada", detalhe: "MP_ACCESS_TOKEN", atencao: true });
  });

  it("chaves de banco listam a financeira e os nomes das chaves", () => {
    expect(
      descreverEvento({
        action: "CREDENCIAL_FINANCEIRA_ATUALIZADA",
        entityId: "mercado-pago",
        metadata: { financeira: "Mercado Pago", chaves: ["MP_ACCESS_TOKEN", "MP_PUBLIC_KEY"] },
      })?.detalhe,
    ).toBe("Mercado Pago · MP_ACCESS_TOKEN, MP_PUBLIC_KEY");
  });

  it("metadado ausente ou torto não derruba a frase", () => {
    expect(descreverEvento({ action: "API_KEY_CREATED", entityId: "k1", metadata: null })?.detalhe).toBeNull();
    expect(descreverEvento({ action: "API_KEY_CREATED", entityId: "k1", metadata: ["x"] })?.detalhe).toBeNull();
    expect(
      descreverEvento({ action: "CERTIFICADO_DA_CASA_ENVIADO", entityId: "casa", metadata: { validoAte: "ontem" } })
        ?.detalhe,
    ).toBeNull();
  });

  it("ação de outra área do painel não é da casa", () => {
    expect(descreverEvento({ action: "RECONCILIATION_COMPROVANTE", entityId: "1", metadata: {} })).toBeNull();
  });
});

describe("consulta do histórico", () => {
  beforeEach(() => vi.resetAllMocks());

  it("busca só as ações da casa, da mais recente para a mais antiga", async () => {
    mock.eventos.mockResolvedValue([]);
    await historicoDaCasa(20);

    expect(mock.eventos).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: { in: Object.keys(ACOES_DA_CASA) } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    );
    // Sem evento, não há por que consultar autores.
    expect(mock.autores).not.toHaveBeenCalled();
  });

  it("resolve o nome do autor e diz quando a conta não existe mais", async () => {
    const quando = new Date("2026-10-06T15:00:00.000Z");
    mock.eventos.mockResolvedValue([
      { id: BigInt(3), actorId: "dono", action: "CERTIFICADO_DA_CASA_REMOVIDO", entityId: "casa", metadata: null, createdAt: quando },
      { id: BigInt(2), actorId: "sumiu", action: "API_KEY_REVOKED", entityId: "k1", metadata: { prefixo: "avk_abc" }, createdAt: quando },
      { id: BigInt(1), actorId: null, action: "PLATFORM_CREDENTIAL_SET", entityId: "X_API_KEY", metadata: {}, createdAt: quando },
    ]);
    mock.autores.mockResolvedValue([{ id: "dono", nome: "Nicolas Avila" }]);

    const historico = await historicoDaCasa();

    expect(mock.autores).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["dono", "sumiu"] } } }),
    );
    expect(historico.map((e) => [e.id, e.titulo, e.detalhe, e.autor])).toEqual([
      ["3", "Certificado digital removido", null, "Nicolas Avila"],
      ["2", "Chave de API revogada", "avk_abc", "conta que não existe mais"],
      ["1", "Credencial gravada", "X_API_KEY", "sistema"],
    ]);
    expect(historico[0].quando).toBe("2026-10-06T15:00:00.000Z");
  });
});
