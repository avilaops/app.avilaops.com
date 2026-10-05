import { describe, expect, it } from "vitest";
import { CobrancaSemLink, garantirEnviavel, montarEmailDaCobranca, montarWhatsappDaCobranca } from "@/lib/entrega-cobranca";
import { MoedaNaoSuportadaPeloPaypal, valorPaypal } from "@/lib/paypal";

/**
 * O núcleo da entrega é puro: dada uma cobrança e um destinatário, monta o
 * e-mail. Testar aqui garante que o cliente recebe o jeito certo de pagar para
 * cada método, sem depender de banco nem do n8n.
 */

const base = {
  method: "BOLETO",
  amount: 357,
  boletoUrl: "https://pag.efi/boleto/abc",
  boletoBarcode: "34191.79001 01043.510047 91020.150008 1 99999999999999",
  pixCopyPaste: null,
  checkoutUrl: null,
  expiresAt: new Date("2026-10-10T00:00:00Z"),
};

const destinatario = { nome: "Maria", email: "maria@cliente.com" };

describe("montarEmailDaCobranca", () => {
  it("manda o boleto com link e linha digitável para quem está cadastrado", () => {
    const email = montarEmailDaCobranca(base, destinatario, "Lojas · Loja Pro · 2026-09");

    expect(email.to).toBe("maria@cliente.com");
    expect(email.subject).toContain("Lojas · Loja Pro · 2026-09");
    expect(email.html).toContain("https://pag.efi/boleto/abc");
    expect(email.html).toContain("34191.79001"); // linha digitável
    expect(email.html).toContain("R$"); // valor formatado
    expect(email.text).toBeTruthy();
  });

  it("no PIX, entrega o copia-e-cola", () => {
    const email = montarEmailDaCobranca(
      { ...base, method: "PIX", boletoUrl: null, boletoBarcode: null, pixCopyPaste: "00020126PIX...5204" },
      destinatario,
      "E-mail profissional · 2026-09",
    );
    expect(email.html).toContain("00020126PIX...5204");
  });

  it("no PayPal/cartão, entrega o link de checkout", () => {
    const email = montarEmailDaCobranca(
      { ...base, method: "PAYPAL", boletoUrl: null, boletoBarcode: null, checkoutUrl: "https://paypal.com/checkout/xyz" },
      destinatario,
      "Plataforma · 2026-09",
    );
    expect(email.html).toContain("https://paypal.com/checkout/xyz");
  });

  it("recusa quando o método não tem como pagar (evita mandar e-mail vazio ao cliente)", () => {
    expect(() =>
      montarEmailDaCobranca(
        { ...base, boletoUrl: null, boletoBarcode: null },
        destinatario,
        "Sem link · 2026-09",
      ),
    ).toThrow(CobrancaSemLink);
  });

  it("escapa HTML do nome e da descrição (não deixa injetar no corpo)", () => {
    const email = montarEmailDaCobranca(base, { nome: "<b>x</b>", email: "x@y.com" }, "<script>alert(1)</script>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>x</b>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("montarWhatsappDaCobranca", () => {
  it("boleto: texto puro com link, linha digitável e valor", () => {
    const texto = montarWhatsappDaCobranca(base, "Lojas · Loja Pro · 2026-09");
    expect(texto).toContain("Lojas · Loja Pro · 2026-09");
    expect(texto).toContain("https://pag.efi/boleto/abc");
    expect(texto).toContain("34191.79001");
    expect(texto).toContain("R$");
    expect(texto).not.toContain("<"); // sem HTML no chat
  });

  it("PIX: entrega o copia-e-cola", () => {
    const texto = montarWhatsappDaCobranca(
      { ...base, method: "PIX", boletoUrl: null, boletoBarcode: null, pixCopyPaste: "00020126PIX...5204" },
      "E-mail · 2026-09",
    );
    expect(texto).toContain("00020126PIX...5204");
  });

  it("recusa quando não há como pagar", () => {
    expect(() =>
      montarWhatsappDaCobranca({ ...base, boletoUrl: null, boletoBarcode: null }, "Sem link · 2026-09"),
    ).toThrow(CobrancaSemLink);
  });
});

describe("conteúdo do envio (fatura / boleto / ambos)", () => {
  const venc = new Date("2026-10-15T00:00:00Z");

  it("modo fatura: só o resumo, sem exigir link de pagamento", () => {
    const email = montarEmailDaCobranca(
      { ...base, boletoUrl: null, boletoBarcode: null },
      destinatario,
      "Lojas · 2026-09",
      "fatura",
      venc,
    );
    expect(email.subject.startsWith("Fatura")).toBe(true);
    expect(email.html).toContain("R$");
    expect(email.html).not.toContain("pag.efi"); // sem link
    expect(email.html).toContain("vencimento");
  });

  it("modo ambos: resumo da fatura E o boleto", () => {
    const email = montarEmailDaCobranca(base, destinatario, "Lojas · 2026-09", "ambos", venc);
    expect(email.html).toContain("Fatura");
    expect(email.html).toContain("https://pag.efi/boleto/abc");
  });

  it("WhatsApp modo fatura: resumo sem link, mesmo sem boleto", () => {
    const texto = montarWhatsappDaCobranca(
      { ...base, boletoUrl: null, boletoBarcode: null },
      "Lojas · 2026-09",
      "fatura",
      venc,
    );
    expect(texto).toContain("Fatura");
    expect(texto).not.toContain("pag.efi");
  });
});

describe("garantirEnviavel", () => {
  const agora = new Date("2026-10-05T12:00:00Z");
  const aberta = { status: "OPEN", saldo: 100 };
  const ativa = { status: "PENDING", expiresAt: new Date("2026-10-10T00:00:00Z"), amount: 100 };

  it("libera cobrança ativa de fatura aberta", () => {
    expect(() => garantirEnviavel(aberta, ativa, "cobranca", agora)).not.toThrow();
  });

  it("recusa link de fatura paga, mas deixa mandar o resumo", () => {
    expect(() => garantirEnviavel({ status: "PAID", saldo: 0 }, ativa, "cobranca", agora)).toThrow(CobrancaSemLink);
    expect(() => garantirEnviavel({ status: "PAID", saldo: 0 }, ativa, "fatura", agora)).not.toThrow();
  });

  it("recusa qualquer envio de fatura cancelada", () => {
    expect(() => garantirEnviavel({ status: "CANCELLED", saldo: 0 }, ativa, "fatura", agora)).toThrow(CobrancaSemLink);
  });

  it("recusa cobrança cancelada, recusada ou paga mesmo com a fatura aberta", () => {
    for (const status of ["CANCELLED", "REJECTED", "rejected", "PAID", "REFUNDED"]) {
      expect(() => garantirEnviavel(aberta, { ...ativa, status }, "ambos", agora)).toThrow(CobrancaSemLink);
    }
  });

  it("recusa cobrança expirada", () => {
    expect(() =>
      garantirEnviavel(aberta, { ...ativa, expiresAt: new Date("2026-10-01T00:00:00Z") }, "cobranca", agora),
    ).toThrow(/expirou/);
  });

  it("recusa cobrança de valor cheio quando a fatura já tem pagamento parcial", () => {
    // Fatura de R$ 100 com R$ 60 alocados: deve R$ 40, não os R$ 100 do PIX.
    const parcial = { status: "OPEN", saldo: 40 };
    expect(() => garantirEnviavel(parcial, ativa, "cobranca", agora)).toThrow(/saldo em aberto/);
    expect(() => garantirEnviavel(parcial, ativa, "ambos", agora)).toThrow(CobrancaSemLink);
    // O resumo não leva meio de pagamento: continua liberado.
    expect(() => garantirEnviavel(parcial, ativa, "fatura", agora)).not.toThrow();
  });

  it("recusa quando o saldo da fatura não pôde ser conferido", () => {
    expect(() => garantirEnviavel({ status: "OPEN", saldo: null }, ativa, "cobranca", agora)).toThrow(/conferir o saldo/);
  });

  it("o juros do cartão parcelado não conta como divergência de saldo", () => {
    const parcelada = { ...ativa, amount: 112.5, interestAmount: 12.5 };
    expect(() => garantirEnviavel(aberta, parcelada, "cobranca", agora)).not.toThrow();
    expect(() => garantirEnviavel({ status: "OPEN", saldo: 40 }, parcelada, "cobranca", agora)).toThrow(/saldo em aberto/);
  });

  it("compara em centavos, sem erro de ponto flutuante", () => {
    expect(() => garantirEnviavel({ status: "OPEN", saldo: 0.3 }, { ...ativa, amount: 0.1 + 0.2 }, "cobranca", agora)).not.toThrow();
  });

  it("sem cobrança emitida, só o resumo passa", () => {
    expect(() => garantirEnviavel(aberta, null, "fatura", agora)).not.toThrow();
    expect(() => garantirEnviavel(aberta, null, "cobranca", agora)).toThrow(/ainda não tem cobrança/);
  });
});

describe("resumo da fatura sem cobrança", () => {
  it("monta e-mail e WhatsApp só com o valor da fatura", () => {
    const vencimento = new Date("2026-10-15T00:00:00Z");
    const email = montarEmailDaCobranca(null, destinatario, "Site · 2026-10", "fatura", vencimento, "BRL", 250);
    expect(email.subject).toBe("Fatura Site · 2026-10");
    expect(email.text).toContain("250,00");
    const zap = montarWhatsappDaCobranca(null, "Site · 2026-10", "fatura", vencimento, "BRL", 250);
    expect(zap).toContain("250,00");
  });

  it("pedir link sem cobrança é erro, não mensagem vazia", () => {
    expect(() => montarEmailDaCobranca(null, destinatario, "Site", "cobranca")).toThrow(CobrancaSemLink);
  });
});

describe("texto puro e moeda", () => {
  it("o corpo em texto puro mantém a URL do boleto visível", () => {
    const email = montarEmailDaCobranca(base, destinatario, "Site");
    expect(email.text).toContain("https://pag.efi/boleto/abc");
  });

  it("cobrança em USD não sai como R$", () => {
    const zap = montarWhatsappDaCobranca(
      { ...base, method: "PAYPAL", checkoutUrl: "https://paypal.test/x", boletoUrl: null },
      "Site",
      "cobranca",
      null,
      "USD",
    );
    expect(zap).not.toContain("R$");
    expect(zap).toContain("US$");
  });

  it("expiração sai no fuso de São Paulo", () => {
    // 01:00 UTC do dia 10 ainda é dia 09 em São Paulo.
    const zap = montarWhatsappDaCobranca({ ...base, expiresAt: new Date("2026-10-10T01:00:00Z") }, "Site");
    expect(zap).toContain("09/10/2026");
  });
});

describe("valorPaypal", () => {
  it("usa duas casas onde há centavos e nenhuma em JPY", () => {
    expect(valorPaypal(100, "USD")).toBe("100.00");
    expect(valorPaypal(1500, "JPY")).toBe("1500");
  });

  it("recusa moeda que o PayPal não aceita e centavos em moeda sem centavos", () => {
    expect(() => valorPaypal(10, "ARS")).toThrow(MoedaNaoSuportadaPeloPaypal);
    expect(() => valorPaypal(10.5, "JPY")).toThrow(MoedaNaoSuportadaPeloPaypal);
  });
});
