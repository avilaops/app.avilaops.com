import { describe, expect, it } from "vitest";
import { scoreMatch } from "@/lib/conciliacao-automatica";
import { suggestScope } from "@/lib/finance-escopo";

describe("suggestScope", () => {
  it("manda fornecedor de operação para a empresa", () => {
    expect(suggestScope({ counterpartyName: "Porkbun", category: "Contas" })).toMatchObject({
      scope: "EMPRESA",
      category: "Domínios",
    });
    expect(
      suggestScope({
        counterpartyName: "NUCLEO DE INFORMACAO E COORDENACAO DO PONTO BR",
        category: "Geral",
      }).scope,
    ).toBe("EMPRESA");
    expect(
      suggestScope({
        counterpartyName: "CORREA CONTABILIDADE E ASSESSORIA EMPRESARIAL",
        category: "Geral",
      }),
    ).toMatchObject({ scope: "EMPRESA", category: "Contabilidade" });
  });

  it("manda categoria de vida para o pessoal", () => {
    expect(
      suggestScope({ counterpartyName: "Casa Das Frutas", category: "Compras no mercado" }).scope,
    ).toBe("PESSOAL");
    expect(suggestScope({ counterpartyName: "Uber", category: "Transporte" }).scope).toBe(
      "PESSOAL",
    );
  });

  it("trata dinheiro entre contas próprias como INTERNO, não como receita", () => {
    // Sem isso, o mesmo dinheiro vira receita na Wise e despesa no Éfi.
    expect(
      suggestScope({
        counterpartyName: "67.954.417 NICOLAS ROSA AVILA BARROS",
        category: "Geral",
      }).scope,
    ).toBe("INTERNO");
    expect(
      suggestScope({ counterpartyName: "NICOLAS ROSA AVILA BARROS", category: "Geral" }).scope,
    ).toBe("INTERNO");
    expect(suggestScope({ isInternalTransfer: true }).scope).toBe("INTERNO");
  });

  it("deixa a dúvida como INDEFINIDO em vez de chutar", () => {
    expect(
      suggestScope({ counterpartyName: "GUSTAVO JUNIO DA SILVA", category: "Geral" }).scope,
    ).toBe("INDEFINIDO");
  });

  it("não confunde fornecedor com contraparte parecida em categoria de vida", () => {
    // Regra de fornecedor vem antes da categoria: um domínio pago no cartão
    // continua sendo custo da operação, mesmo que a Wise chame de "Compras".
    expect(
      suggestScope({ counterpartyName: "PORKBUN", category: "Compras" }).scope,
    ).toBe("EMPRESA");
  });
});

const HOJE = new Date("2026-08-20T12:00:00Z");

function movimento(over: Partial<Parameters<typeof scoreMatch>[0]> = {}) {
  return {
    id: BigInt(1),
    direction: "CREDIT",
    amount: 1500,
    currency: "BRL",
    counterpartyName: "JLA IMPORTADORA DE VEDACOES LTDA",
    description: "Pix recebido",
    occurredAt: HOJE,
    ...over,
  };
}

function conta(over: Partial<Parameters<typeof scoreMatch>[1]> = {}) {
  return {
    id: BigInt(9),
    direction: "RECEIVABLE",
    amount: 1500,
    currency: "BRL",
    counterparty: "JLA Importadora",
    description: "Mensalidade agosto",
    dueDate: HOJE,
    ...over,
  };
}

describe("scoreMatch", () => {
  it("casa valor exato, no vencimento e com contraparte igual", () => {
    const match = scoreMatch(movimento(), conta());
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("não casa entrada com conta a pagar", () => {
    expect(scoreMatch(movimento(), conta({ direction: "PAYABLE" }))).toBeNull();
  });

  it("não casa moedas diferentes", () => {
    expect(scoreMatch(movimento({ currency: "EUR" }), conta())).toBeNull();
  });

  it("descarta diferença de valor acima de 1%", () => {
    expect(scoreMatch(movimento({ amount: 1600 }), conta())).toBeNull();
  });

  it("descarta distância maior que 30 dias do vencimento", () => {
    expect(
      scoreMatch(movimento({ occurredAt: new Date("2026-06-01T12:00:00Z") }), conta()),
    ).toBeNull();
  });

  it("fica abaixo da baixa automática quando só valor e data batem", () => {
    // Valor redondo mais data próxima é justamente o caso que casa contas
    // erradas — tem de virar sugestão, nunca baixa.
    const match = scoreMatch(
      movimento({ counterpartyName: "Outra Empresa Qualquer" }),
      conta({ counterparty: null }),
    );
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeLessThan(0.85);
  });
});

describe("suggestScope — a armadilha do titular", () => {
  it("não marca gasto do cartão como INTERNO só porque o titular é o remetente", () => {
    // A contraparte é a OUTRA ponta. Passar o titular aqui marcaria todo gasto
    // do cartão como dinheiro entre contas, e o resultado inteiro zeraria.
    expect(
      suggestScope({ counterpartyName: "Casa Das Frutas", category: "Compras no mercado" }).scope,
    ).toBe("PESSOAL");
    expect(suggestScope({ counterpartyName: "Porkbun", category: "Contas" }).scope).toBe(
      "EMPRESA",
    );
  });
});
