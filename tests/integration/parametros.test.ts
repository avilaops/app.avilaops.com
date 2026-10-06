import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * A camada de parâmetros contra o banco: as sementes da migração batem com o
 * catálogo, uma versão nova nunca mexe na anterior e deixa auditoria, e
 * política que contraria regra externa não é gravada.
 */

const state = vi.hoisted(() => ({ tx: null as unknown }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.tx; } }));

import { carregarVersoes, dataDoEvento, ErroDeParametro, lerParametro, registrarVersaoDeParametro } from "@/lib/parametros";
import { conferirForma, definicaoDe } from "@/lib/parametros/catalogo";
import { conflitos } from "@/lib/parametros/validacao";

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use banco descartável _test.");
const db = new PrismaClient();
const rollback = new Error("rollback");

async function isolado(teste: (tx: Prisma.TransactionClient, dono: string) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => {
      state.tx = tx;
      // Parte do estado da migração: versão registrada antes (à mão, em outro
      // teste) não pode decidir o resultado. A transação desfaz no fim.
      await tx.policyParameterVersion.deleteMany({ where: { NOT: { id: { startsWith: "semente:" } } } });
      const dono = randomUUID();
      await tx.adminIdentity.create({
        data: { id: dono, nome: "Dono", email: `${dono}@example.invalid`, senhaHash: "x", senhaProvisoria: false, role: "OWNER", ativo: true },
      });
      await teste(tx, dono);
      throw rollback;
    }, { timeout: 30_000 });
  } catch (erro) {
    if (erro !== rollback) throw erro;
  } finally {
    state.tx = null;
  }
}

afterAll(() => db.$disconnect());

const hoje = () => dataDoEvento(new Date());

describe("parâmetros de política", () => {
  it("as sementes da migração estão no catálogo, na camada certa e com valor de forma válida", () => isolado(async () => {
    const versoes = await carregarVersoes();
    const sementes = versoes.filter((v) => v.id.startsWith("semente:"));
    expect(sementes.length).toBeGreaterThanOrEqual(25);
    for (const v of sementes) {
      const definicao = definicaoDe(v.chave);
      expect(definicao, v.chave).toBeDefined();
      expect(v.camada, v.chave).toBe(definicao!.camada);
      expect(conferirForma(definicao!.tipo, v.valor), v.chave).toBeNull();
      expect(v.fontes.length, v.chave).toBeGreaterThan(0);
      // Valor proposto não decide até o dono confirmar.
      if (v.camada === "POLITICA_PRODUTO") expect(v.estado).toBe("PENDENTE_DE_CONFIRMACAO");
    }
    expect(conflitos(sementes, hoje())).toEqual([]);
  }));

  it("lê a trava de transferência pela data do evento", () => isolado(async () => {
    const dentro = await lerParametro("icann.transfer.travaAposTrocaTitularDias", { em: new Date("2026-01-10T12:00:00Z") });
    expect(dentro).toMatchObject({ tipo: "vigente", valor: 60 });
    const antes = await lerParametro("icann.transfer.travaAposTrocaTitularDias", { em: new Date("2025-08-20T12:00:00Z") });
    expect(antes.tipo).toBe("ausente");
    await expect(lerParametro("nao.existe")).rejects.toThrow(/catálogo/);
  }));

  it("confirmar um valor proposto grava versão nova, deixa a pendente intacta e audita antes e depois", () => isolado(async (tx, dono) => {
    expect((await lerParametro("produto.dns.versoesRetencaoDias")).tipo).toBe("pendente");

    const nova = await registrarVersaoDeParametro(
      { chave: "produto.dns.versoesRetencaoDias", valor: 90, estado: "VIGENTE", vigenteDesde: hoje(), fontes: ["interno 13"], dono: "Dono do serviço" },
      dono,
    );

    expect(await lerParametro("produto.dns.versoesRetencaoDias")).toMatchObject({ tipo: "vigente", valor: 90, versao: { id: nova.id } });
    const semente = await tx.policyParameterVersion.findUniqueOrThrow({ where: { id: "semente:produto.dns.versoesRetencaoDias" } });
    expect(semente.state).toBe("PENDENTE_DE_CONFIRMACAO");

    const evento = await tx.operationsAuditEvent.findFirstOrThrow({ where: { entityId: nova.id, action: "PARAMETRO_VERSAO_REGISTRADA" } });
    expect(evento.actorId).toBe(dono);
    expect(evento.metadata).toMatchObject({
      chave: "produto.dns.versoesRetencaoDias",
      antes: { id: "semente:produto.dns.versoesRetencaoDias", estado: "PENDENTE_DE_CONFIRMACAO", valor: 90 },
      depois: { valor: 90, estado: "VIGENTE" },
    });
  }));

  it("política menos protetora que a regra externa não é gravada", () => isolado(async (tx, dono) => {
    const antes = await tx.policyParameterVersion.count();
    await expect(
      registrarVersaoDeParametro(
        { chave: "produto.avisos.diasAntes", valor: [15, 1], estado: "VIGENTE", vigenteDesde: hoje(), fontes: ["externo 02"], dono: "Dono do serviço" },
        dono,
      ),
    ).rejects.toBeInstanceOf(ErroDeParametro);
    expect(await tx.policyParameterVersion.count()).toBe(antes);
  }));
});
