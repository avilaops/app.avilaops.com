import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ leitura: vi.fn() }));
vi.mock("@/lib/prisma", async (importOriginal) => {
  const { prisma } = await importOriginal<typeof import("@/lib/prisma")>();
  return { prisma: {
    chaveDeApi: { findUnique: mock.leitura },
    $transaction: prisma.$transaction.bind(prisma),
  } };
});
// Cliente real para preparar e conferir a fixture; só a leitura da rota é dublada.
const { prisma: db } = await vi.importActual<typeof import("@/lib/prisma")>("@/lib/prisma");

vi.mock("@/lib/auth", () => ({
  getAdmin: async () => ({ id: "teste-revogacao", role: "OWNER" }),
  ehDono: (role: string) => role === "OWNER",
}));
vi.mock("@/lib/http", () => ({ sameOrigin: () => true }));
import { DELETE } from "@/app/api/chaves-api/[id]/route";

const url = new URL(process.env.DATABASE_URL!);
if (!url.pathname.endsWith("_test")) {
  throw new Error("Revogação: banco descartável deve terminar em _test.");
}
afterAll(() => db.$disconnect());

describe("revogação concorrente no PostgreSQL", () => {
  it("duas leituras da chave ativa produzem uma revogação e um único evento", async () => {
    const id = randomUUID();
    const chave = await db.chaveDeApi.create({ data: {
      id, nome: "Teste concorrência", prefixo: `avk_${id}`, hash: id,
      escopos: ["projetos:ler"], criadaPor: "teste-revogacao",
    } });
    // Força a janela da corrida: ambas as rotas leem a chave ainda ativa.
    // Updates e auditoria continuam usando transações e conexões reais.
    mock.leitura.mockReset().mockResolvedValue(chave);
    const revogar = () => DELETE(
      new NextRequest(`http://localhost:3000/api/chaves-api/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );

    try {
      const respostas = await Promise.all([revogar(), revogar()]);
      expect(respostas.map((resposta) => resposta.status)).toEqual([200, 200]);
      const corpos = await Promise.all(respostas.map((resposta) => resposta.json()));
      expect(corpos.filter((corpo) => corpo.jaRevogada === true)).toHaveLength(1);
      expect(corpos.filter((corpo) => !corpo.jaRevogada)).toEqual([{ ok: true }]);
      expect(mock.leitura).toHaveBeenCalledTimes(2);
      mock.leitura.mockImplementation((args) => db.chaveDeApi.findUnique(args));

      const revogada = await db.chaveDeApi.findUniqueOrThrow({ where: { id } });
      expect(revogada.revogadaEm).toBeInstanceOf(Date);
      expect(await db.operationsAuditEvent.count({
        where: { action: "API_KEY_REVOKED", entityType: "ChaveDeApi", entityId: id },
      })).toBe(1);
      expect(await (await revogar()).json()).toEqual({ ok: true, jaRevogada: true });
      expect((await db.chaveDeApi.findUniqueOrThrow({ where: { id } })).revogadaEm)
        .toEqual(revogada.revogadaEm);
      expect(await db.operationsAuditEvent.count({
        where: { action: "API_KEY_REVOKED", entityType: "ChaveDeApi", entityId: id },
      })).toBe(1);
    } finally {
      mock.leitura.mockReset();
      await db.operationsAuditEvent.deleteMany({ where: { entityType: "ChaveDeApi", entityId: id } });
      await db.chaveDeApi.deleteMany({ where: { id } });
    }
  });
});
