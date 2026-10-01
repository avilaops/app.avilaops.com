import { describe, expect, it } from "vitest";
import { cnaesDaReceita, formatarCnae, sociosDaReceita } from "@/components/FichaDaReceita";
import { listaDeSegmentos, segmentoPeloCnae } from "@/lib/segmentos";

describe("segmentos", () => {
  it("soma os segmentos em uso à lista padrão, sem repetir nem perder o Outro no fim", () => {
    const lista = listaDeSegmentos(["Academias e fitness", "tecnologia", null, "  ", "Academias e fitness"]);
    expect(lista.filter((s) => s.toLowerCase() === "tecnologia")).toHaveLength(1);
    expect(lista).toContain("Academias e fitness");
    expect(lista.at(-1)).toBe("Outro");
  });

  it("palpita o segmento pela divisão do CNAE e não chuta quando não sabe", () => {
    expect(segmentoPeloCnae("6201501")).toBe("Tecnologia");
    expect(segmentoPeloCnae(4649499)).toBe("Comércio e e-commerce");
    expect(segmentoPeloCnae("0111301")).toBeNull();
    expect(segmentoPeloCnae(null)).toBeNull();
  });
});

describe("ficha da Receita", () => {
  const dados = {
    cnae_fiscal: 4649499,
    cnae_fiscal_descricao: "Comércio atacadista de outros equipamentos",
    cnaes_secundarios: [
      { codigo: 3292202, descricao: "Fabricação de equipamentos esportivos" },
      { codigo: 0, descricao: "" },
    ],
    qsa: [{ nome_socio: "FULANO DE TAL", qualificacao_socio: "Sócio-Administrador" }],
  };

  it("lista o CNAE principal e os secundários, sem o zero da Receita", () => {
    expect(cnaesDaReceita(dados).map((c) => c.codigo)).toEqual(["4649499", "3292202"]);
  });

  it("formata o CNAE como nos documentos", () => {
    expect(formatarCnae(6201501)).toBe("6201-5/01");
    expect(formatarCnae("111301")).toBe("0111-3/01");
  });

  it("lê os sócios", () => {
    expect(sociosDaReceita(dados)).toEqual([{ nome: "FULANO DE TAL", qualificacao: "Sócio-Administrador" }]);
  });
});
