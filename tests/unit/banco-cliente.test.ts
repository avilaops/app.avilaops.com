import { describe, expect, it } from "vitest";
import { catalogoSchema, limparAnotacao, preenchimento } from "@/lib/banco-cliente";

const valido = {
  key: "procommerce",
  name: "ProCommerce",
  engine: "SQLSERVER",
  databaseName: "Procommerce",
  environment: "PRODUCTION",
  tables: [
    {
      schema: "dbo",
      name: "PRODUTO",
      rowCount: 5591,
      columns: [{ name: "PROD_COD", ordinal: 1, dataType: "int", nullable: false, primaryKey: true }],
    },
  ],
};

describe("catalogoSchema", () => {
  it("aceita o mínimo que o script envia", () => {
    expect(catalogoSchema.safeParse(valido).success).toBe(true);
  });

  it("recusa motor desconhecido em vez de gravar texto livre", () => {
    expect(catalogoSchema.safeParse({ ...valido, engine: "sqlserver2008" }).success).toBe(false);
  });

  it("recusa key que não serve de endereço", () => {
    // A key vai na URL da ficha (?banco=) e casa sincronizações entre si.
    for (const key of ["Pro Commerce", "PROCOMMERCE", "-x", ""]) {
      expect(catalogoSchema.safeParse({ ...valido, key }).success).toBe(false);
    }
  });

  it("recusa catálogo sem tabela", () => {
    // Reenviar vazio apagaria tudo que não tem anotação.
    expect(catalogoSchema.safeParse({ ...valido, tables: [] }).success).toBe(false);
  });

  it("recusa contagem negativa ou fracionada", () => {
    const tabela = { ...valido.tables[0], rowCount: -1 };
    expect(catalogoSchema.safeParse({ ...valido, tables: [tabela] }).success).toBe(false);
    expect(catalogoSchema.safeParse({ ...valido, tables: [{ ...tabela, rowCount: 1.5 }] }).success).toBe(false);
  });
});

describe("preenchimento", () => {
  it("calcula o percentual com uma casa", () => {
    expect(preenchimento(BigInt(1539), BigInt(1556))).toBe(98.9);
    expect(preenchimento(0, 10)).toBe(0);
    expect(preenchimento(10, 10)).toBe(100);
  });

  it("não inventa percentual quando não houve medição ou a tabela está vazia", () => {
    expect(preenchimento(null, 10)).toBeNull();
    expect(preenchimento(5, null)).toBeNull();
    expect(preenchimento(0, 0)).toBeNull();
  });
});

describe("limparAnotacao", () => {
  it("trata texto em branco como anotação removida", () => {
    // `null` é o que a sincronização usa para decidir se pode apagar o que sumiu.
    expect(limparAnotacao("   ")).toBeNull();
    expect(limparAnotacao(undefined)).toBeNull();
    expect(limparAnotacao("  estoque da loja 1 ")).toBe("estoque da loja 1");
  });
});
