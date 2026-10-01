import { describe, expect, it } from "vitest";
import {
  chaveDoMes,
  competenciaDoLancamento,
  mesesNoIntervalo,
  montarDre,
  ratear,
  type LinhaDre,
} from "@/lib/dre";
import { contaSugerida, contaPorCodigo, PLANO_DE_CONTAS } from "@/lib/plano-de-contas";

describe("plano de contas", () => {
  it("não tem código repetido e todo grupo é conhecido", () => {
    const codigos = PLANO_DE_CONTAS.map((conta) => conta.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const conta of PLANO_DE_CONTAS) {
      expect(contaPorCodigo(conta.codigo)).toMatchObject({ rotulo: conta.rotulo });
    }
  });

  it("aproveita a categoria que as regras de escopo já escrevem", () => {
    expect(contaSugerida({ categoria: "Domínios", direcao: "DEBIT" })).toBe("3.2");
    expect(contaSugerida({ categoria: "Infraestrutura", direcao: "DEBIT" })).toBe("3.1");
    expect(contaSugerida({ categoria: "Impostos", direcao: "DEBIT" })).toBe("2.1");
    // Acento e caixa não podem decidir classificação contábil.
    expect(contaSugerida({ categoria: "comunicacao", direcao: "DEBIT" })).toBe("3.4");
  });

  it("entrada sem categoria é venda; saída sem categoria fica a classificar", () => {
    // Chutar despesa faz o resultado mentir para baixo sem ninguém perceber.
    expect(contaSugerida({ direcao: "CREDIT" })).toBe("1.2");
    expect(contaSugerida({ direcao: "DEBIT" })).toBe("9.9");
    expect(contaSugerida({ categoria: "Uber", direcao: "DEBIT" })).toBe("9.9");
  });
});

describe("competência", () => {
  it("rateia sem perder centavo", () => {
    const partes = ratear(600, 7);
    expect(partes).toHaveLength(7);
    expect(partes.reduce((soma, valor) => soma + valor, 0)).toBeCloseTo(600, 2);
    // A sobra vai toda para o primeiro mês, que é o mais fácil de conferir.
    expect(partes[0]).toBeCloseTo(85.74, 2);
    expect(partes[1]).toBeCloseTo(85.71, 2);
  });

  it("espalha o anual pelos doze meses, a partir da competência", () => {
    const partes = competenciaDoLancamento({
      amount: 600,
      dueDate: new Date("2026-01-10T12:00:00Z"),
      competenceStart: new Date("2026-01-01T00:00:00Z"),
      competenceMonths: 12,
    });

    expect(partes).toHaveLength(12);
    expect(partes[0]).toMatchObject({ mes: "2026-01", valor: 50 });
    expect(partes[11]).toMatchObject({ mes: "2026-12", valor: 50 });
  });

  it("sem competência declarada, o vencimento manda — como era antes", () => {
    const partes = competenciaDoLancamento({
      amount: 350,
      dueDate: new Date("2026-09-18T12:00:00Z"),
      competenceStart: null,
      competenceMonths: null,
    });

    expect(partes).toEqual([{ mes: "2026-09", valor: 350 }]);
  });

  it("lista os meses do intervalo, inclusive as pontas", () => {
    expect(
      mesesNoIntervalo(new Date("2026-07-15T00:00:00Z"), new Date("2026-09-02T00:00:00Z")),
    ).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(chaveDoMes(new Date("2026-12-31T23:00:00Z"))).toBe("2026-12");
  });
});

describe("montarDre", () => {
  const meses = ["2026-09"];
  const linhas: LinhaDre[] = [
    { conta: "1.1", mes: "2026-09", valor: 1200, origem: "COMPETENCIA" },
    { conta: "1.2", mes: "2026-09", valor: 350, origem: "CAIXA" },
    { conta: "2.1", mes: "2026-09", valor: -93, origem: "CAIXA" },
    { conta: "3.1", mes: "2026-09", valor: -200, origem: "CAIXA" },
    { conta: "3.2", mes: "2026-09", valor: -50, origem: "COMPETENCIA" },
    { conta: "4.2", mes: "2026-09", valor: -300, origem: "CAIXA" },
    { conta: "5.1", mes: "2026-09", valor: -7, origem: "CAIXA" },
    { conta: "9.9", mes: "2026-09", valor: -40, origem: "CAIXA" },
    { conta: "6.1", mes: "2026-09", valor: -500, origem: "CAIXA" },
  ];

  it("encadeia receita, margem e resultado operacional", () => {
    const dre = montarDre(linhas, meses);

    expect(dre.receitaBruta).toBe(1550);
    expect(dre.deducoes).toBe(93);
    expect(dre.receitaLiquida).toBe(1457);
    expect(dre.custos).toBe(250);
    expect(dre.margemBruta).toBe(1207);
    expect(dre.despesas).toBe(300);
    // Sem imobilizado, resultado operacional é o EBITDA desta casa.
    expect(dre.resultadoOperacional).toBe(907);
    expect(dre.financeiro).toBe(7);
    expect(dre.resultadoLiquido).toBe(900);
  });

  it("o que não foi classificado aparece à parte, nunca diluído", () => {
    const dre = montarDre(linhas, meses);
    // Sinal cru de propósito: negativo é dinheiro que saiu e ninguém sabe do
    // que é. Inverter o sinal como se faz com custo afirmaria que é despesa,
    // que é exatamente o que ainda não se sabe.
    expect(dre.aClassificar).toBe(-40);
    // Se entrasse como despesa, o resultado operacional seria 867.
    expect(dre.resultadoOperacional).toBe(907);
  });

  it("distribuição de lucros não é despesa e não muda o resultado", () => {
    const dre = montarDre(linhas, meses);
    expect(dre.movimentoSocio).toBe(-500);
    expect(dre.resultadoLiquido).toBe(900);
  });

  it("diz quanto do demonstrativo veio de competência", () => {
    const dre = montarDre(linhas, meses);
    // 1250 de 2740 movimentados — o resto é reconhecimento por caixa.
    expect(dre.cobertura).toBeCloseTo(45.62, 1);
  });

  it("ignora mês fora do intervalo e conta desconhecida vira 'a classificar'", () => {
    const dre = montarDre(
      [
        { conta: "1.1", mes: "2026-08", valor: 999, origem: "CAIXA" },
        { conta: "7.7", mes: "2026-09", valor: -10, origem: "CAIXA" },
      ],
      meses,
    );

    expect(dre.receitaBruta).toBe(0);
    expect(dre.aClassificar).toBe(-10);
  });

  it("cada conta mostra a origem do próprio número", () => {
    const dre = montarDre(linhas, meses);
    const receita = dre.grupos.find((grupo) => grupo.grupo === "RECEITA");

    expect(receita?.contas).toHaveLength(2);
    expect(receita?.contas[0]).toMatchObject({
      conta: "1.1",
      total: 1200,
      porCompetencia: 1200,
      porCaixa: 0,
    });
    expect(receita?.contas[1]).toMatchObject({ conta: "1.2", porCaixa: 350 });
  });
});
