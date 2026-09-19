import { describe, expect, it } from "vitest";
import { contar } from "@/lib/format";

describe("contagem com a palavra na forma certa", () => {
  it("um é singular, o resto é plural", () => {
    expect(contar(1, "loja", "lojas")).toBe("1 loja");
    expect(contar(6, "loja", "lojas")).toBe("6 lojas");
  });

  it("zero é plural em português — 'nenhuma loja' é outra frase", () => {
    expect(contar(0, "loja", "lojas")).toBe("0 lojas");
  });

  it("o plural vem escrito porque não sai de regra", () => {
    expect(contar(2, "dia útil", "dias úteis")).toBe("2 dias úteis");
    expect(contar(1, "dia útil", "dias úteis")).toBe("1 dia útil");
  });

  it("número grande sai com separador de milhar", () => {
    expect(contar(5867, "produto", "produtos")).toBe("5.867 produtos");
  });
});
