import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TransactionList, {
  type LinhaMovimentacao,
} from "@/components/TransactionList";

// Os controles da linha usam o roteador do Next; fora do app ele não existe.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const base: LinhaMovimentacao = {
  id: "1",
  occurredAt: "2026-08-27T17:02:00.000Z",
  description: "Pix recebido",
  transactionType: "PIX_IN",
  counterpartyName: "Fulano da Silva",
  counterpartyDocument: null,
  counterpartySource: null,
  endToEndId: null,
  direction: "CREDIT",
  amount: "450.00",
  currency: "BRL",
  scope: "EMPRESA",
  scopeSource: "MANUAL",
  reconciliation: {
    status: "MATCHED",
    referenceType: "LEDGER",
    referenceId: "42",
    note: null,
  },
};

describe("TransactionList", () => {
  it("é uma tabela acessível com um DOM só (desktop e celular são CSS)", () => {
    const html = renderToStaticMarkup(<TransactionList transactions={[base]} />);
    expect(html).toContain('role="table"');
    expect(html.match(/role="columnheader"/g)).toHaveLength(8);
    expect(html.match(/role="row"/g)).toHaveLength(2);
    expect(html.match(/role="cell"/g)).toHaveLength(8);
    // As áreas da grade do celular precisam existir pelo nome de classe.
    for (const area of ["tx-kind", "tx-amount", "tx-party", "tx-date", "tx-ref", "tx-scope", "tx-state", "tx-actions"]) {
      expect(html).toContain(`class="${area}`);
    }
  });

  it("entrada e saída são distinguíveis pelo sinal e pela cor", () => {
    const saida: LinhaMovimentacao = {
      ...base,
      id: "2",
      direction: "DEBIT",
      counterpartyName: null,
      reconciliation: null,
    };
    const html = renderToStaticMarkup(<TransactionList transactions={[base, saida]} />);
    expect(html).toContain("tx-amount money positive");
    expect(html).toContain("+ R$");
    expect(html).toContain("− R$");
    expect(html).toContain("Não informado");
    expect(html).toContain("Sem vínculo");
    expect(html).toContain("Conta #42");
    expect(html).toContain("status-pending");
  });
});
