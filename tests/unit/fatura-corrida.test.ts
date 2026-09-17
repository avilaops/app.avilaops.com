import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * A corrida do `garantirFatura`, sem depender de sorte no agendamento.
 *
 * O teste de integração dispara chamadas concorrentes de verdade e só pega o
 * defeito quando elas se cruzam na janela certa — foi assim que o CI ficou
 * vermelho três vezes enquanto a `main` seguia verde. Aqui o P2002 é forçado,
 * então o caminho do tratamento é exercitado em toda execução.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    upsertLanca: false,
    chamadasUpsert: 0,
    chamadasFindUnique: 0,
    ultimaChaveFindUnique: null as unknown,
  },
}));

const FATURA_EXISTENTE = { id: "fatura-do-outro-processo", competence: "2026-09", kind: "MONTHLY" };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: async () => ({
        id: "assinatura-1",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        billingDay: 10,
        amount: 250,
      }),
    },
    subscriptionInvoice: {
      upsert: async () => {
        estado.chamadasUpsert += 1;
        if (estado.upsertLanca) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`subscription_id`,`competence`,`kind`)",
            { code: "P2002", clientVersion: "teste" },
          );
        }
        return { id: "fatura-nova", competence: "2026-09", kind: "MONTHLY" };
      },
      findUnique: async ({ where }: { where: unknown }) => {
        estado.chamadasFindUnique += 1;
        estado.ultimaChaveFindUnique = where;
        return FATURA_EXISTENTE;
      },
    },
  },
}));

const { garantirFatura } = await import("@/lib/assinaturas");

describe("garantirFatura sob corrida", () => {
  beforeEach(() => {
    estado.upsertLanca = false;
    estado.chamadasUpsert = 0;
    estado.chamadasFindUnique = 0;
    estado.ultimaChaveFindUnique = null;
  });

  it("sem corrida, devolve a fatura do upsert e não relê o banco", async () => {
    const fatura = await garantirFatura({ subscriptionId: "assinatura-1", competencia: "2026-09" });

    expect(fatura?.id).toBe("fatura-nova");
    expect(estado.chamadasFindUnique).toBe(0);
  });

  it("perder a corrida devolve a fatura do outro processo, sem estourar", async () => {
    // O cenário real: o cron rodou duas vezes e o outro processo gravou primeiro.
    estado.upsertLanca = true;

    const fatura = await garantirFatura({ subscriptionId: "assinatura-1", competencia: "2026-09" });

    expect(fatura).toEqual(FATURA_EXISTENTE);
    expect(estado.chamadasUpsert).toBe(1);
    expect(estado.chamadasFindUnique).toBe(1);
  });

  it("relê exatamente a chave única que barrou a gravação", async () => {
    estado.upsertLanca = true;

    await garantirFatura({ subscriptionId: "assinatura-1", competencia: "2026-09", tipo: "SETUP" });

    expect(estado.ultimaChaveFindUnique).toEqual({
      subscriptionId_competence_kind: {
        subscriptionId: "assinatura-1",
        competence: "2026-09",
        kind: "SETUP",
      },
    });
  });

  it("erro que não é P2002 continua subindo — só a corrida é tratada", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.spyOn(prisma.subscriptionInvoice, "upsert").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Banco indisponível", {
        code: "P1001",
        clientVersion: "teste",
      }),
    );

    await expect(
      garantirFatura({ subscriptionId: "assinatura-1", competencia: "2026-09" }),
    ).rejects.toThrow("Banco indisponível");
  });
});
