import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FaturasDoCliente, { type FaturaDoCliente } from "@/components/FaturasDoCliente";

const invoice: FaturaDoCliente = { id: "test", descricao: "Plano", competencia: "2026-09",
  tipo: "MONTHLY", valor: 100, saldo: 100, moeda: "BRL", vencimento: "2026-09-01",
  status: "OVERDUE", pagaEm: null, cobranca: null };
describe("faturas: apresentação e ações", () => {
  it("preserva o dia civil de vencimento e descreve dívida vencida", () => {
    const html = renderToStaticMarkup(<FaturasDoCliente pais="Brasil" iniciais={[invoice]} />);
    expect(html).toContain("venceu 01/09/2026");
    expect(html).not.toContain("31/08/2026");
    expect(html).toContain('role="status"');
    expect(html).toContain('id="faturas"');
  });
  it("não oferece pagar o valor integral após pagamento parcial", () => {
    const html = renderToStaticMarkup(<FaturasDoCliente pais="Brasil" iniciais={[{ ...invoice, saldo: 40 }]} />);
    expect(html).toContain("Saldo restante");
    expect(html).not.toContain("Pagar com Pix");
    expect(html).not.toContain("Gerar boleto");
  });
  it("exibe a moeda real e não oferece gateway BRL para USD", () => {
    const html = renderToStaticMarkup(<FaturasDoCliente pais="Brasil" iniciais={[{ ...invoice, moeda: "USD" }]} />);
    expect(html).toContain("US$");
    expect(html).not.toContain("Pagar com Pix");
  });
});
