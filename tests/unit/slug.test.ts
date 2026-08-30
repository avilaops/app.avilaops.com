import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("tira acento, baixa caixa e troca o resto por hífen", () => {
    expect(slugify("Identidade Visual Essencial")).toBe("identidade-visual-essencial");
    expect(slugify("Catálogo PDF · Premium!")).toBe("catalogo-pdf-premium");
    expect(slugify("  E-mail profissional  ")).toBe("e-mail-profissional");
  });

  it("não deixa hífen sobrando nas pontas nem passa do limite", () => {
    expect(slugify("---a---")).toBe("a");
    expect(slugify("x".repeat(100))).toHaveLength(80);
    expect(slugify("Ç", 1)).toBe("c");
  });

  it("vazio continua vazio (a API decide o que fazer)", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});
