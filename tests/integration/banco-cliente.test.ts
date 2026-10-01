import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { carregarCatalogo, sincronizarCatalogo, type CatalogoPayload } from "@/lib/banco-cliente";
import { prisma } from "@/lib/prisma";
import { cnpjDeTeste } from "../fixtures/documento";

/**
 * Sincronização do catálogo contra Postgres de verdade.
 *
 * O que interessa aqui é o que só o banco decide: reenviar não duplicar, a
 * anotação sobreviver ao reenvio, e o que sumiu da origem ser apagado sem
 * levar junto o que alguém escreveu.
 */

const PREFIXO = "teste-banco-cliente-";
let organizationId = "";

async function limpar() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
}

function catalogo(tabelas: CatalogoPayload["tables"]): CatalogoPayload {
  return {
    key: "procommerce",
    name: "ProCommerce",
    engine: "SQLSERVER",
    databaseName: "TechVeda_Test",
    environment: "TEST",
    tables: tabelas,
  };
}

const PRODUTO: CatalogoPayload["tables"][number] = {
  schema: "dbo",
  name: "PRODUTO",
  rowCount: 1556,
  columns: [
    { name: "PROD_COD", ordinal: 1, dataType: "int", nullable: false, primaryKey: true },
    { name: "PROD_NOME", ordinal: 2, dataType: "varchar(150)", nullable: true, filledCount: 1556, distinctCount: 1550 },
    { name: "GRUPO_COD", ordinal: 3, dataType: "int", nullable: true, referencesTable: "GRUPO", referencesColumn: "GRUPO_COD" },
  ],
};
const GRUPO: CatalogoPayload["tables"][number] = {
  schema: "dbo",
  name: "GRUPO",
  rowCount: 0,
  columns: [{ name: "GRUPO_COD", ordinal: 1, dataType: "int", nullable: false, primaryKey: true }],
};

beforeEach(async () => {
  await limpar();
  const sufixo = Math.floor(Math.random() * 1e9).toString(36);
  const organizacao = await prisma.organization.create({
    data: { name: "Vedashow de teste", slug: `${PREFIXO}${sufixo}`, cpfCnpj: cnpjDeTeste(sufixo) },
  });
  organizationId = organizacao.id;
});
afterAll(limpar);

describe("sincronizarCatalogo", () => {
  it("grava banco, tabelas e colunas", async () => {
    const resumo = await sincronizarCatalogo(organizationId, catalogo([PRODUTO, GRUPO]));
    expect(resumo).toMatchObject({ tabelas: 2, colunas: 4, tabelasRemovidas: 0, colunasRemovidas: 0 });

    const { totais, tabela } = await carregarCatalogo(organizationId, { tabela: "PRODUTO" });
    expect(totais).toMatchObject({ tabelas: 2, tabelasComDados: 1, colunas: 4, chavesEstrangeiras: 1, anotadas: 0 });
    expect(totais?.linhas).toBe(BigInt(1556));
    expect(tabela?.columns.map((c) => c.name)).toEqual(["PROD_COD", "PROD_NOME", "GRUPO_COD"]);
    expect(tabela?.columns[1].filledCount).toBe(BigInt(1556));
  });

  it("reenviar atualiza no lugar, sem duplicar e sem trocar os ids", async () => {
    await sincronizarCatalogo(organizationId, catalogo([PRODUTO]), new Date("2026-09-17T10:00:00Z"));
    const antes = await prisma.clientDatabaseColumn.findMany({ where: { table: { database: { organizationId } } }, orderBy: { ordinal: "asc" } });

    const mudou = { ...PRODUTO, rowCount: 5591, columns: PRODUTO.columns.map((c) => (c.name === "PROD_NOME" ? { ...c, dataType: "varchar(200)" } : c)) };
    await sincronizarCatalogo(organizationId, catalogo([mudou]), new Date("2026-09-17T11:00:00Z"));
    const depois = await prisma.clientDatabaseColumn.findMany({ where: { table: { database: { organizationId } } }, orderBy: { ordinal: "asc" } });

    // Id estável é o que mantém de pé a anotação e o link já mandado a alguém.
    expect(depois.map((c) => c.id)).toEqual(antes.map((c) => c.id));
    expect(depois[1].dataType).toBe("varchar(200)");
    expect(await prisma.clientDatabase.count({ where: { organizationId } })).toBe(1);
    const tabela = await prisma.clientDatabaseTable.findFirstOrThrow({ where: { database: { organizationId } } });
    expect(tabela.rowCount).toBe(BigInt(5591));
  });

  it("não sobrescreve anotação ao reenviar", async () => {
    await sincronizarCatalogo(organizationId, catalogo([PRODUTO]), new Date("2026-09-17T10:00:00Z"));
    await prisma.clientDatabaseColumn.updateMany({
      where: { name: "PROD_NOME", table: { database: { organizationId } } },
      data: { description: "Nome exibido no PDV e na nota" },
    });

    await sincronizarCatalogo(organizationId, catalogo([PRODUTO]), new Date("2026-09-17T11:00:00Z"));
    const coluna = await prisma.clientDatabaseColumn.findFirstOrThrow({ where: { name: "PROD_NOME", table: { database: { organizationId } } } });
    expect(coluna.description).toBe("Nome exibido no PDV e na nota");
  });

  it("apaga o que sumiu da origem, mas guarda o que tem anotação", async () => {
    await sincronizarCatalogo(organizationId, catalogo([PRODUTO, GRUPO]), new Date("2026-09-17T10:00:00Z"));
    await prisma.clientDatabaseColumn.updateMany({
      where: { name: "GRUPO_COD", table: { name: "PRODUTO", database: { organizationId } } },
      data: { description: "Aponta para o grupo do produto" },
    });

    // Nova versão do ERP: some a tabela GRUPO e duas colunas de PRODUTO.
    const enxuto = { ...PRODUTO, columns: [PRODUTO.columns[0]] };
    const resumo = await sincronizarCatalogo(organizationId, catalogo([enxuto]), new Date("2026-09-17T11:00:00Z"));
    expect(resumo).toMatchObject({ tabelasRemovidas: 1, colunasRemovidas: 1 });

    const restantes = await prisma.clientDatabaseColumn.findMany({ where: { table: { database: { organizationId } } }, orderBy: { ordinal: "asc" } });
    expect(restantes.map((c) => c.name)).toEqual(["PROD_COD", "GRUPO_COD"]);
    // A anotada ficou com a data antiga: é assim que a tela sabe que ela sumiu.
    expect(restantes[1].lastSeenAt.toISOString()).toBe("2026-09-17T10:00:00.000Z");
    expect(restantes[0].lastSeenAt.toISOString()).toBe("2026-09-17T11:00:00.000Z");
  });

  it("não mistura bancos de clientes diferentes com a mesma key", async () => {
    const outra = await prisma.organization.create({ data: { name: "Outro cliente", slug: `${PREFIXO}outro-${Date.now().toString(36)}` } });
    await sincronizarCatalogo(organizationId, catalogo([PRODUTO]));
    await sincronizarCatalogo(outra.id, catalogo([GRUPO]));

    expect((await carregarCatalogo(organizationId, {})).totais?.tabelas).toBe(1);
    expect((await carregarCatalogo(outra.id, {})).totais?.tabelas).toBe(1);
    expect((await carregarCatalogo(outra.id, { tabela: "PRODUTO" })).tabela).toBeNull();
  });
});

describe("carregarCatalogo", () => {
  it("oculta tabela vazia ao navegar, mas a busca procura no banco inteiro", async () => {
    await sincronizarCatalogo(organizationId, catalogo([PRODUTO, GRUPO]));

    expect((await carregarCatalogo(organizationId, {})).tabelas?.map((t) => t.name)).toEqual(["PRODUTO"]);
    expect((await carregarCatalogo(organizationId, { vazias: true })).tabelas?.map((t) => t.name)).toEqual(["PRODUTO", "GRUPO"]);
    // "grupo_cod" é coluna das duas; GRUPO está vazia e ainda assim aparece.
    expect((await carregarCatalogo(organizationId, { q: "grupo_cod" })).tabelas?.map((t) => t.name)).toEqual(["PRODUTO", "GRUPO"]);
  });

  it("lista quem aponta para a tabela", async () => {
    await sincronizarCatalogo(organizationId, catalogo([PRODUTO, GRUPO]));
    const { referenciadaPor } = await carregarCatalogo(organizationId, { tabela: "dbo.GRUPO" });
    expect(referenciadaPor?.map((r) => `${r.table.name}.${r.name}`)).toEqual(["PRODUTO.GRUPO_COD"]);
  });

  it("cliente sem banco catalogado devolve vazio, não erro", async () => {
    const vazio = await carregarCatalogo(organizationId, {});
    expect(vazio.banco).toBeNull();
    expect(vazio.bancos).toEqual([]);
  });
});
