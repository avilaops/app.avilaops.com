import { describe, expect, it } from "vitest";
import {
  opcaoParcelamento,
  simularParcelamento,
  PARCELAS_MAXIMAS,
  TAXA_MENSAL,
} from "@/lib/parcelamento";

/**
 * O juros do cartão é dinheiro do cliente, calculado por nós.
 *
 * Errar para menos come a margem em silêncio; errar para mais é cobrança
 * indevida. Nenhum dos dois aparece em log — aparece na fatura de alguém.
 */

const MENSALIDADE = 25_000; // R$ 250,00, o contrato do Minas
const IMPLANTACAO = 65_000; // R$ 650,00

describe("parcelamento", () => {
  it("à vista não tem acréscimo", () => {
    const [aVista] = simularParcelamento(MENSALIDADE);

    expect(aVista.parcelas).toBe(1);
    expect(aVista.valorParcelaCents).toBe(MENSALIDADE);
    expect(aVista.totalCents).toBe(MENSALIDADE);
    expect(aVista.jurosCents).toBe(0);
  });

  it("oferece de 1x até o teto, sem buracos", () => {
    const opcoes = simularParcelamento(MENSALIDADE);

    expect(opcoes).toHaveLength(PARCELAS_MAXIMAS);
    expect(opcoes.map((o) => o.parcelas)).toEqual(
      Array.from({ length: PARCELAS_MAXIMAS }, (_, i) => i + 1),
    );
  });

  it("o total é sempre parcela × n — o que o cliente confere na calculadora", () => {
    for (const opcao of simularParcelamento(IMPLANTACAO)) {
      expect(opcao.totalCents).toBe(opcao.valorParcelaCents * opcao.parcelas);
      expect(opcao.jurosCents).toBe(opcao.totalCents - IMPLANTACAO);
    }
  });

  it("trabalha em centavos inteiros, sem fração de moeda", () => {
    for (const opcao of simularParcelamento(29_900)) {
      expect(Number.isInteger(opcao.valorParcelaCents)).toBe(true);
      expect(Number.isInteger(opcao.totalCents)).toBe(true);
      expect(Number.isInteger(opcao.jurosCents)).toBe(true);
    }
  });

  it("cobra mais caro quanto mais se parcela, sempre", () => {
    const opcoes = simularParcelamento(MENSALIDADE);

    for (let i = 1; i < opcoes.length; i += 1) {
      expect(opcoes[i].totalCents).toBeGreaterThan(opcoes[i - 1].totalCents);
      expect(opcoes[i].valorParcelaCents).toBeLessThan(opcoes[i - 1].valorParcelaCents);
    }
  });

  it("bate com a Tabela Price nos valores do contrato do Minas", () => {
    // Conferido à mão: 250 × [i / (1 − (1+i)^−12)], i = 0,0399.
    const doze = opcaoParcelamento(MENSALIDADE, 12);

    expect(doze?.valorParcelaCents).toBe(2662);
    expect(doze?.totalCents).toBe(31_944);

    const implantacaoDoze = opcaoParcelamento(IMPLANTACAO, 12);

    expect(implantacaoDoze?.valorParcelaCents).toBe(6922);
    expect(implantacaoDoze?.totalCents).toBe(83_064);
  });

  it("juros zero devolve o valor cheio em qualquer parcela", () => {
    const opcoes = simularParcelamento(MENSALIDADE, { taxaMensal: 0 });

    for (const opcao of opcoes) {
      expect(opcao.totalCents).toBe(MENSALIDADE);
      expect(opcao.jurosCents).toBe(0);
    }
  });

  it("recusa parcela que não está na tabela", () => {
    expect(opcaoParcelamento(MENSALIDADE, 0)).toBeNull();
    expect(opcaoParcelamento(MENSALIDADE, 13)).toBeNull();
    expect(opcaoParcelamento(MENSALIDADE, 1.5)).toBeNull();
    expect(opcaoParcelamento(MENSALIDADE, -3)).toBeNull();
  });

  it("a taxa contratada é 3,99% ao mês", () => {
    // Trocar isto é decisão comercial, não refatoração. O teste existe para a
    // mudança aparecer no diff de quem revisa.
    expect(TAXA_MENSAL).toBe(0.0399);
  });
});
