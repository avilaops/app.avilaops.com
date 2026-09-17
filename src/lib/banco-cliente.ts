import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Catálogo do banco de dados do cliente.
 *
 * O Ávila OS não conecta no banco: o servidor de produção não enxerga a rede
 * do cliente. A estrutura chega pronta, enviada por um script que roda onde há
 * acesso (para a Vedashow, `avilaops/Procommerce` via Radmin VPN). Por isso
 * tudo aqui parte de um payload, nunca de uma conexão.
 */

export const MOTORES = ["SQLSERVER", "POSTGRES", "MYSQL", "FIREBIRD", "ORACLE", "OUTRO"] as const;
export const AMBIENTES = ["PRODUCTION", "TEST"] as const;

const contagem = z.number().int().nonnegative().nullable().optional();
const texto = (max: number) => z.string().trim().min(1).max(max);
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();

const colunaSchema = z.object({
  name: texto(128),
  ordinal: z.number().int().nonnegative(),
  dataType: texto(80),
  nullable: z.boolean(),
  primaryKey: z.boolean().optional(),
  referencesTable: textoOpcional(128),
  referencesColumn: textoOpcional(128),
  filledCount: contagem,
  distinctCount: contagem,
  minValue: textoOpcional(120),
  maxValue: textoOpcional(120),
});

const tabelaSchema = z.object({
  schema: texto(128),
  name: texto(128),
  rowCount: contagem,
  columns: z.array(colunaSchema).max(2000),
});

export const catalogoSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "use minúsculas, números e hífen"),
  name: texto(120),
  engine: z.enum(MOTORES),
  engineVersion: textoOpcional(200),
  host: textoOpcional(200),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  databaseName: texto(128),
  environment: z.enum(AMBIENTES),
  accessNotes: textoOpcional(1000),
  syncedFrom: textoOpcional(120),
  tables: z.array(tabelaSchema).min(1).max(5000),
});

export type CatalogoPayload = z.infer<typeof catalogoSchema>;

export type ResumoSincronizacao = {
  databaseId: string;
  tabelas: number;
  colunas: number;
  tabelasRemovidas: number;
  colunasRemovidas: number;
  sincronizadoEm: string;
};

/** Percentual de linhas em que a coluna tem valor; `null` quando não foi medido. */
export function preenchimento(filledCount: bigint | number | null, rowCount: bigint | number | null): number | null {
  if (filledCount === null || rowCount === null) return null;
  const linhas = Number(rowCount);
  if (linhas <= 0) return null;
  return Math.round((Number(filledCount) / linhas) * 1000) / 10;
}

export function limparAnotacao(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().slice(0, 2000);
  return limpo || null;
}

/**
 * Grava o catálogo enviado. Reenviar é seguro: tabela e coluna casam por nome
 * e só os campos lidos da origem são sobrescritos — `description` fica.
 *
 * O que sumiu da origem é apagado, exceto o que tem anotação: uma coluna
 * renomeada numa atualização do ERP levaria embora, em silêncio, o que alguém
 * escreveu sobre ela. Esses ficam, com `lastSeenAt` parado na data antiga, e a
 * tela os mostra como ausentes.
 */
export async function sincronizarCatalogo(
  organizationId: string,
  payload: CatalogoPayload,
  agora: Date = new Date(),
): Promise<ResumoSincronizacao> {
  // As colunas são TIMESTAMP sem fuso e o Prisma grava UTC nelas; o cast de um
  // timestamptz dependeria do fuso da sessão do Postgres.
  const instante = agora.toISOString().replace("Z", "");

  return prisma.$transaction(
    async (tx) => {
      const dados = {
        name: payload.name,
        engine: payload.engine,
        engineVersion: payload.engineVersion || null,
        host: payload.host || null,
        port: payload.port ?? null,
        databaseName: payload.databaseName,
        environment: payload.environment,
        accessNotes: payload.accessNotes || null,
        syncedFrom: payload.syncedFrom || null,
        lastSyncedAt: agora,
      };
      const banco = await tx.clientDatabase.upsert({
        where: { organizationId_key: { organizationId, key: payload.key } },
        create: { organizationId, key: payload.key, ...dados },
        update: dados,
        select: { id: true },
      });

      const tabelasJson = JSON.stringify(
        payload.tables.map((t) => ({
          id: randomUUID(),
          schema_name: t.schema,
          name: t.name,
          row_count: t.rowCount ?? null,
        })),
      );
      const gravadas = await tx.$queryRaw<{ id: string; schema_name: string; name: string }[]>`
        INSERT INTO "operations"."client_database_tables"
          ("id", "database_id", "schema_name", "name", "row_count", "last_seen_at", "updated_at")
        SELECT r.id, ${banco.id}, r.schema_name, r.name, r.row_count, ${instante}::timestamp, ${instante}::timestamp
        FROM jsonb_to_recordset(${tabelasJson}::jsonb)
          AS r(id text, schema_name text, name text, row_count bigint)
        ON CONFLICT ("database_id", "schema_name", "name") DO UPDATE SET
          "row_count" = EXCLUDED."row_count",
          "last_seen_at" = EXCLUDED."last_seen_at",
          "updated_at" = EXCLUDED."updated_at"
        RETURNING "id", "schema_name", "name"`;

      const idDaTabela = new Map(gravadas.map((t) => [`${t.schema_name}.${t.name}`, t.id]));
      const colunas = payload.tables.flatMap((t) =>
        t.columns.map((c) => ({
          id: randomUUID(),
          table_id: idDaTabela.get(`${t.schema}.${t.name}`),
          name: c.name,
          ordinal: c.ordinal,
          data_type: c.dataType,
          nullable: c.nullable,
          is_primary_key: c.primaryKey ?? false,
          references_table: c.referencesTable || null,
          references_column: c.referencesColumn || null,
          filled_count: c.filledCount ?? null,
          distinct_count: c.distinctCount ?? null,
          min_value: c.minValue || null,
          max_value: c.maxValue || null,
        })),
      );
      if (colunas.length) {
        await tx.$executeRaw`
          INSERT INTO "operations"."client_database_columns"
            ("id", "table_id", "name", "ordinal", "data_type", "nullable", "is_primary_key",
             "references_table", "references_column", "filled_count", "distinct_count",
             "min_value", "max_value", "last_seen_at", "updated_at")
          SELECT r.id, r.table_id, r.name, r.ordinal, r.data_type, r.nullable, r.is_primary_key,
                 r.references_table, r.references_column, r.filled_count, r.distinct_count,
                 r.min_value, r.max_value, ${instante}::timestamp, ${instante}::timestamp
          FROM jsonb_to_recordset(${JSON.stringify(colunas)}::jsonb)
            AS r(id text, table_id text, name text, ordinal int, data_type text, nullable bool,
                 is_primary_key bool, references_table text, references_column text,
                 filled_count bigint, distinct_count bigint, min_value text, max_value text)
          ON CONFLICT ("table_id", "name") DO UPDATE SET
            "ordinal" = EXCLUDED."ordinal",
            "data_type" = EXCLUDED."data_type",
            "nullable" = EXCLUDED."nullable",
            "is_primary_key" = EXCLUDED."is_primary_key",
            "references_table" = EXCLUDED."references_table",
            "references_column" = EXCLUDED."references_column",
            "filled_count" = EXCLUDED."filled_count",
            "distinct_count" = EXCLUDED."distinct_count",
            "min_value" = EXCLUDED."min_value",
            "max_value" = EXCLUDED."max_value",
            "last_seen_at" = EXCLUDED."last_seen_at",
            "updated_at" = EXCLUDED."updated_at"`;
      }

      const tabelasRemovidas = await tx.clientDatabaseTable.deleteMany({
        where: {
          databaseId: banco.id,
          lastSeenAt: { lt: agora },
          description: null,
          columns: { none: { description: { not: null } } },
        },
      });
      const colunasRemovidas = await tx.clientDatabaseColumn.deleteMany({
        where: { table: { databaseId: banco.id }, lastSeenAt: { lt: agora }, description: null },
      });

      return {
        databaseId: banco.id,
        tabelas: payload.tables.length,
        colunas: colunas.length,
        tabelasRemovidas: tabelasRemovidas.count,
        colunasRemovidas: colunasRemovidas.count,
        sincronizadoEm: agora.toISOString(),
      };
    },
    { timeout: 60_000 },
  );
}

export type FiltroCatalogo = { banco?: string; q?: string; tabela?: string; vazias?: boolean };

/** Tudo que a seção "Banco de dados" da ficha mostra, numa leitura só. */
export async function carregarCatalogo(organizationId: string, filtro: FiltroCatalogo) {
  const bancos = await prisma.clientDatabase.findMany({
    where: { organizationId },
    orderBy: [{ environment: "asc" }, { name: "asc" }],
  });
  const banco = bancos.find((b) => b.key === filtro.banco) ?? bancos[0] ?? null;
  if (!banco) return { bancos, banco: null };

  const q = filtro.q?.trim() ?? "";
  const busca = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { description: { contains: q, mode: "insensitive" as const } },
          {
            columns: {
              some: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const [totais, comDados, colunas, chavesEstrangeiras, anotadas, tabelas] = await Promise.all([
    prisma.clientDatabaseTable.aggregate({ where: { databaseId: banco.id }, _count: true, _sum: { rowCount: true } }),
    prisma.clientDatabaseTable.count({ where: { databaseId: banco.id, rowCount: { gt: 0 } } }),
    prisma.clientDatabaseColumn.count({ where: { table: { databaseId: banco.id } } }),
    prisma.clientDatabaseColumn.count({ where: { table: { databaseId: banco.id }, referencesTable: { not: null } } }),
    prisma.clientDatabaseColumn.count({ where: { table: { databaseId: banco.id }, description: { not: null } } }),
    prisma.clientDatabaseTable.findMany({
      where: {
        databaseId: banco.id,
        ...busca,
        // Buscar é procurar no banco inteiro; o filtro de vazias só vale navegando.
        ...(q || filtro.vazias ? {} : { rowCount: { gt: 0 } }),
      },
      orderBy: [{ rowCount: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      include: { _count: { select: { columns: true } } },
    }),
  ]);

  const [esquema, nome] = filtro.tabela?.includes(".") ? filtro.tabela.split(".", 2) : [undefined, filtro.tabela];
  const tabela = nome
    ? await prisma.clientDatabaseTable.findFirst({
        where: { databaseId: banco.id, name: nome, ...(esquema ? { schemaName: esquema } : {}) },
        include: { columns: { orderBy: { ordinal: "asc" } } },
      })
    : null;
  const referenciadaPor = tabela
    ? await prisma.clientDatabaseColumn.findMany({
        where: { table: { databaseId: banco.id }, referencesTable: tabela.name },
        select: { name: true, referencesColumn: true, table: { select: { schemaName: true, name: true } } },
        orderBy: [{ table: { name: "asc" } }, { name: "asc" }],
      })
    : [];

  return {
    bancos,
    banco,
    totais: {
      tabelas: totais._count,
      tabelasComDados: comDados,
      linhas: totais._sum.rowCount ?? BigInt(0),
      colunas,
      chavesEstrangeiras,
      anotadas,
    },
    tabelas,
    tabela,
    referenciadaPor,
  };
}
