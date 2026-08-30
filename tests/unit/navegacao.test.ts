import { describe, expect, it } from "vitest";
import { abasCelular, navegacao, type SecaoApp } from "@/lib/navegacao";

const secoes = navegacao.flatMap((grupo) => grupo.items.map((item) => item.section));

describe("mapa de navegação", () => {
  it("cada seção aparece uma vez só (senão duas entradas acendem juntas)", () => {
    const repetidas = secoes.filter((secao, i) => secoes.indexOf(secao) !== i);
    expect(repetidas).toEqual([]);
  });

  it("cada aba do celular aponta para um destino que existe no mapa", () => {
    const hrefs = new Set(navegacao.flatMap((g) => g.items.map((i) => i.href)));
    for (const aba of abasCelular) {
      expect(hrefs.has(aba.href)).toBe(true);
    }
  });

  it("nenhuma seção acende duas abas ao mesmo tempo", () => {
    const vistas = new Map<SecaoApp, string>();
    for (const aba of abasCelular) {
      for (const secao of aba.secoes) {
        expect(vistas.get(secao)).toBeUndefined();
        vistas.set(secao, aba.label);
      }
    }
  });

  it("toda seção de aba existe no mapa (uma seção só de aba seria órfã)", () => {
    for (const aba of abasCelular) {
      for (const secao of aba.secoes) {
        expect(secoes).toContain(secao);
      }
    }
  });

  it("cabe no polegar: no máximo quatro abas mais o 'Mais'", () => {
    expect(abasCelular.length).toBeLessThanOrEqual(4);
  });
});
