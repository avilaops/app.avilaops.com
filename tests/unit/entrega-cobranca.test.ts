import { describe, expect, it } from "vitest";
import { CobrancaSemLink, montarEmailDaCobranca, montarWhatsappDaCobranca } from "@/lib/entrega-cobranca";

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
