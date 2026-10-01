import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TabelaMovimentacoes, { type LinhaMovimentacao } from "@/components/financeiro/TabelaMovimentacoes";
import { serieDoFluxo } from "@/lib/fluxo-diario";
import {
  nomeCurtoDaConta,
  rotuloEstado,
  rotuloInstituicao,
  rotuloTipoMovimentacao,
  rotuloVinculo,
} from "@/lib/financeiro-rotulos";
import { diaEmSaoPaulo, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";

// Os controles da linha usam o roteador do Next; fora do app ele não existe.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

// Espaço fino e sem quebra que o Intl usa entre "R$" e o número.
const sem = (texto: string) => texto.replace(/\s/g, " ");

describe("formatação pt-BR", () => {
  it("percentual com vírgula, nunca com ponto", () => {
    expect(formatPercent(29.166)).toBe("29,2%");
    expect(formatPercent(0)).toBe("0,0%");
  });

  it("número sem zero à esquerda", () => {
    expect(formatNumber(8)).toBe("8");
    expect(formatNumber(1234)).toBe("1.234");
  });

  it("eixo do gráfico abreviado em reais", () => {
    expect(sem(formatCompactCurrency(3500))).toBe("R$ 3,5 mil");
    expect(sem(formatCompactCurrency(-2000))).toBe("-R$ 2 mil");
  });

  it("dia do calendário é o de São Paulo, não o de UTC", () => {
    // 23h de 28/09 em São Paulo já é 29/09 em UTC.
    expect(diaEmSaoPaulo("2026-09-29T02:00:00.000Z")).toBe("2026-09-28");
  });
});

describe("rótulos do Financeiro", () => {
  it("tipo cru nunca chega à tela", () => {
    expect(rotuloTipoMovimentacao("PIX_SENT")).toBe("Pix enviado");
    expect(rotuloTipoMovimentacao("CARD_PURCHASE")).toBe("Compra no cartão");
    expect(rotuloTipoMovimentacao("iof")).toBe("IOF");
    expect(rotuloTipoMovimentacao("ALGO_NOVO")).toBe("Outra movimentação");
  });

  it("estado e vínculo em português, comprovante sem o identificador longo", () => {
    expect(rotuloEstado("MATCHED")).toBe("Conciliado");
    expect(rotuloEstado(null)).toBe("Pendente");
    expect(rotuloVinculo("LEDGER", "139")).toBe("Conta #139");
    expect(rotuloVinculo("COMPROVANTE", "E0000000020260928ABC")).toBe("Comprovante");
    expect(rotuloVinculo("LEDGER", null)).toBeNull();
  });

  it("conta agrupada pela instituição perde o prefixo repetido", () => {
    expect(rotuloInstituicao("wise")).toBe("Wise");
    expect(nomeCurtoDaConta("Wise · EUR", "wise")).toBe("EUR");
    expect(nomeCurtoDaConta("Mercado Pago · CNPJ 67.954.417", "mercadopago")).toBe("CNPJ 67.954.417");
    expect(nomeCurtoDaConta("Conta Efí Produção", "efi")).toBe("Conta Efí Produção");
  });
});

describe("série do gráfico de fluxo", () => {
  const agora = Date.now();
  const dia = 24 * 60 * 60 * 1000;

  it("tem todos os dias do período, inclusive os vazios", () => {
    const inicio = new Date(agora - 30 * dia);
    const serie = serieDoFluxo(
      [
        { occurredAt: new Date(agora - 2 * dia), direction: "CREDIT", amount: "100.10" },
        { occurredAt: new Date(agora - 2 * dia), direction: "CREDIT", amount: "0.20" },
        { occurredAt: new Date(agora - 5 * dia), direction: "DEBIT", amount: 40 },
      ],
      inicio,
      30,
    );
    expect(serie).toHaveLength(30);
    expect(serie.at(-1)?.dia).toBe(diaEmSaoPaulo(new Date(agora)));
    expect(serie.filter((p) => p.entradas === 0 && p.saidas === 0)).toHaveLength(28);
    // Centavos somados não viram 100.30000000000001.
    expect(serie.find((p) => p.entradas > 0)?.entradas).toBe(100.3);
    expect(serie.find((p) => p.saidas > 0)?.saidas).toBe(40);
  });

  it("no ano, o balde é a semana", () => {
    const serie = serieDoFluxo([], new Date(agora - 365 * dia), 365, 7);
    expect(serie).toHaveLength(53);
  });

  it("ignora o que veio antes do início", () => {
    const serie = serieDoFluxo(
      [{ occurredAt: new Date(agora - 40 * dia), direction: "CREDIT", amount: 10 }],
      new Date(agora - 7 * dia),
      7,
    );
    expect(serie.every((p) => p.entradas === 0)).toBe(true);
  });
});

const base: LinhaMovimentacao = {
  id: "1",
  occurredAt: "2026-09-28T12:26:00.000Z",
  description: "Pix enviado",
  transactionType: "PIX_SENT",
  counterpartyName: "Porkbun LLC",
  counterpartyDocument: null,
  counterpartySource: null,
  endToEndId: null,
  direction: "DEBIT",
  amount: "397.25",
  currency: "BRL",
  scope: "EMPRESA",
  scopeSource: "REGRA",
  category: "Domínios",
  reconciliation: { status: "MATCHED", referenceType: "LEDGER", referenceId: "42", note: null },
};

describe("TabelaMovimentacoes", () => {
  it("mostra rótulo legível, vínculo dentro do estado e nenhum select de escopo", () => {
    const entrada: LinhaMovimentacao = {
      ...base,
      id: "2",
      direction: "CREDIT",
      transactionType: "PIX_RECEIVED",
      counterpartyName: null,
      description: "Pix recebido",
      reconciliation: null,
      currency: "EUR",
    };
    const html = sem(renderToStaticMarkup(<TabelaMovimentacoes linhas={[base, entrada]} />));
    expect(html).not.toContain(">PIX_SENT<");
    expect(html).toContain("Pix enviado");
    expect(html).toContain("Conta #42");
    expect(html).not.toContain("Sem vínculo");
    expect(html).not.toContain("<select");
    expect(html).toContain("− R$ 397,25");
    // Moeda original quando não é real.
    expect(html).toContain("+ € 397,25");
    // Descrição igual ao tipo não se repete ("Pix enviado · Pix enviado").
    expect(html).not.toContain("Pix enviado · Pix enviado");
    // Uma tabela para o desktop e uma lista de cartões tocáveis para o celular.
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html.match(/aria-label="Revisar /g)).toHaveLength(2);
  });
});
