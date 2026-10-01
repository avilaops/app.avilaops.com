import { describe, expect, it } from "vitest";
import { nomeProprio } from "@/lib/format";

describe("nome do cliente na tela", () => {
  it("caixa alta da Receita vira nome próprio", () => {
    expect(nomeProprio("VEDASHOW")).toBe("Vedashow");
    expect(nomeProprio("AVILA TRANSPORTES")).toBe("Avila Transportes");
  });

  it("partícula no meio do nome fica minúscula", () => {
    expect(nomeProprio("ENGREACO INDUSTRIA E COMERCIO")).toBe(
      "Engreaco Industria e Comercio",
    );
    expect(nomeProprio("CASA DO VALE")).toBe("Casa do Vale");
  });

  it("partícula no começo é palavra como qualquer outra", () => {
    expect(nomeProprio("DO VALE COMERCIO")).toBe("Do Vale Comercio");
  });

  it("acento entra na conta da caixa", () => {
    expect(nomeProprio("ÁVILA OPS")).toBe("Ávila Ops");
    expect(nomeProprio("óptica central")).toBe("Óptica Central");
  });

  it("maiúscula no meio da palavra foi escolha de quem digitou", () => {
    expect(nomeProprio("iFood")).toBe("iFood");
    expect(nomeProprio("McDonald's Brasil")).toBe("McDonald's Brasil");
  });

  it("hífen e apóstrofo abrem palavra nova", () => {
    expect(nomeProprio("ANA-MARIA MODAS")).toBe("Ana-Maria Modas");
    expect(nomeProprio("D'AVILA ENGENHARIA")).toBe("D'Avila Engenharia");
  });

  it("vazio e nulo não viram texto", () => {
    expect(nomeProprio("")).toBe("");
    expect(nomeProprio(null)).toBe("");
    expect(nomeProprio(undefined)).toBe("");
  });

  it("espaço entre as palavras não é reorganizado", () => {
    expect(nomeProprio("  BRASA   MINEIRA  ")).toBe("Brasa   Mineira");
  });
});
