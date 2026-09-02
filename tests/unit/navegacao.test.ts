import { describe, expect, it } from "vitest";
import { abasDoPapel, abasCelular, navegacao, navegacaoDoPapel, type SecaoApp } from "@/lib/navegacao";

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

  // A barra desenha as abas do papel MAIS o botão "Mais". Cinco células num
  // iPhone de 375px dão 75px cada, acima dos 44px que a Apple pede; seis
  // dariam 62px com o rótulo ilegível.
  it.each(["OWNER", "ADMIN"])("cabe no polegar para %s: até cinco células na barra", (papel) => {
    expect(abasDoPapel(papel).length + 1).toBeLessThanOrEqual(5);
  });

  it("todo item que o papel vê no menu tem grupo com título", () => {
    for (const papel of ["OWNER", "ADMIN"]) {
      for (const grupo of navegacaoDoPapel(papel)) {
        expect(grupo.label.trim()).not.toBe("");
        expect(grupo.items.length).toBeGreaterThan(0);
      }
    }
  });

  // Grupo comprido obriga a rolar a coluna do desktop e a folha "Mais".
  it("nenhum grupo passa de sete itens", () => {
    for (const grupo of navegacao) {
      expect(grupo.items.length).toBeLessThanOrEqual(7);
    }
  });

  it("a equipe não enxerga nada marcado como do dono", () => {
    const items = navegacaoDoPapel("ADMIN").flatMap((grupo) => grupo.items);
    expect(items.some((item) => item.somenteDono)).toBe(false);
    expect(abasDoPapel("ADMIN").some((aba) => aba.somenteDono)).toBe(false);
  });
});
