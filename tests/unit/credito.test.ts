import { describe, expect, it } from "vitest";
import { faixaDoScore, montarResumo, type LeituraScore } from "@/lib/credito";

function leitura(parcial: Partial<LeituraScore> & { id: string }): LeituraScore {
  return {
    subjectKind: "CPF",
    bureau: "SERASA",
    score: 700,
    maxScore: 1000,
    readAt: new Date("2026-09-01T12:00:00Z"),
    source: "MANUAL",
    note: null,
    ...parcial,
  };
}

describe("faixaDoScore", () => {
  it("segue as faixas do Serasa", () => {
    expect(faixaDoScore(300).rotulo).toBe("Baixo");
    expect(faixaDoScore(301).rotulo).toBe("Regular");
    expect(faixaDoScore(500).rotulo).toBe("Regular");
    expect(faixaDoScore(501).rotulo).toBe("Bom");
    expect(faixaDoScore(700).rotulo).toBe("Bom");
    expect(faixaDoScore(701).rotulo).toBe("Excelente");
  });

  it("vale em proporção para escala de 100", () => {
    expect(faixaDoScore(30, 100).rotulo).toBe("Baixo");
    expect(faixaDoScore(85, 100).rotulo).toBe("Excelente");
  });
});

describe("montarResumo", () => {
  it("sem leitura não inventa número", () => {
    const resumo = montarResumo("CNPJ", []);
    expect(resumo.atual).toBeNull();
    expect(resumo.variacao).toBeNull();
    expect(resumo.diasSemConferir).toBeNull();
  });

  it("compara só com a leitura anterior do mesmo birô", () => {
    const hoje = new Date("2026-09-10T12:00:00Z");
    const resumo = montarResumo(
      "CPF",
      [
        leitura({ id: "3", score: 812, readAt: new Date("2026-09-05T12:00:00Z") }),
        leitura({ id: "2", score: 640, bureau: "BOA_VISTA", readAt: new Date("2026-09-03T12:00:00Z") }),
        leitura({ id: "1", score: 790, readAt: new Date("2026-08-01T12:00:00Z") }),
      ],
      hoje,
    );
    expect(resumo.atual?.id).toBe("3");
    expect(resumo.anterior?.id).toBe("1");
    expect(resumo.variacao).toBe(22);
    expect(resumo.diasSemConferir).toBe(5);
  });

  it("primeira leitura de um birô não tem variação", () => {
    const resumo = montarResumo("CPF", [
      leitura({ id: "2", bureau: "QUOD", score: 500 }),
      leitura({ id: "1", score: 800, readAt: new Date("2026-08-01T12:00:00Z") }),
    ]);
    expect(resumo.anterior).toBeNull();
    expect(resumo.variacao).toBeNull();
  });
});
