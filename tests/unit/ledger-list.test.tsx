import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LedgerList from "@/components/LedgerList";
import type { LedgerRow } from "@/lib/contas";

// As ações da linha usam o roteador do Next; fora do app ele não existe.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const base: LedgerRow = {
  id: "7",
  direction: "RECEIVABLE",
  status: "OPEN",
  description: "Mensalidade Ávila OS",
  counterparty: "Vedashow",
  amount: "149.00",
  currency: "BRL",
  scope: "EMPRESA",
  dueDate: new Date("2026-09-15T00:00:00.000Z"),
  paidAt: null,
  category: "Assinatura",
  note: null,
  referenceType: null,
  referenceId: null,
  overdue: false,
  daysLate: 0,
};

describe("LedgerList", () => {
  it("é uma tabela acessível com um DOM só (desktop e celular são CSS)", () => {
    const html = renderToStaticMarkup(<LedgerList rows={[base]} />);
    expect(html).toContain('role="table"');
    expect(html.match(/role="columnheader"/g)).toHaveLength(7);
    expect(html.match(/role="row"/g)).toHaveLength(2);
    expect(html.match(/role="cell"/g)).toHaveLength(7);
    for (const area of ["lg-due", "lg-kind", "lg-party", "lg-amount", "lg-scope", "lg-state", "lg-actions"]) {
      expect(html).toContain(`class="${area}`);
    }
  });

  it("a receber e a pagar se distinguem pelo sinal; vencida ganha marca e dias de atraso", () => {
    const vencida: LedgerRow = {
      ...base,
      id: "8",
      direction: "PAYABLE",
      counterparty: null,
      dueDate: new Date("2026-09-01T00:00:00.000Z"),
      overdue: true,
      daysLate: 9,
    };
    const quitada: LedgerRow = {
      ...base,
      id: "9",
      status: "PAID",
      referenceType: "BANK_TRANSACTION",
      referenceId: "123",
    };
    const html = renderToStaticMarkup(
      <LedgerList rows={[base, vencida, quitada]} />,
    );
    expect(html).toContain("lg-amount money positive");
    expect(html).toContain("+ R$");
    expect(html).toContain("− R$");
    expect(html).toContain("lg-row lg-row-overdue");
    expect(html).toContain("9 dias de atraso");
    expect(html).toContain("status-overdue");
    expect(html).toContain("Sem contraparte");
    expect(html).toContain("conciliada com o extrato");
    // Em aberto oferece a baixa; quitada oferece reabrir.
    expect(html).toContain("Recebi");
    expect(html).toContain("Dar baixa");
    expect(html).toContain("Reabrir");
  });
});
