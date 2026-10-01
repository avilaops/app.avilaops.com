import { describe, expect, it } from "vitest";
import { FINANCEIRAS, chavesDoFinanceiro, financeiraPorSlug } from "@/lib/credenciais-financeiro";
import { categoriaDaChave, ehSegredo } from "@/lib/credenciais";

/**
 * O catálogo das financeiras.
 *
 * Testado porque ele é o contrato entre a tela e o cofre: um nome de chave
 * errado aqui cria uma credencial órfã, guardada com capricho e lida por
 * ninguém. Foi assim que o parque chegou a ter `MERCADO_PAGO_ACCES_TOKEN_PROD`,
 * com o typo de origem, convivendo com a chave certa.
 */

describe("catálogo do financeiro", () => {
  it("traz as cinco que a casa usa", () => {
    expect(FINANCEIRAS.map((f) => f.slug)).toEqual([
      "mercado-pago",
      "efi",
      "paypal",
      "wise",
      "nubank",
    ]);
  });

  it("usa nome de chave no formato que o cofre aceita", () => {
    for (const chave of chavesDoFinanceiro()) {
      expect(chave, `${chave} precisa ser MAIÚSCULAS_COM_UNDERSCORE`).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("não repete chave entre financeiras", () => {
    const chaves = chavesDoFinanceiro();
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("as chaves do Mercado Pago são as que o código lê de verdade", () => {
    const mp = financeiraPorSlug("mercado-pago");
    expect(mp?.campos.map((c) => c.chave)).toEqual([
      "MP_ACCESS_TOKEN",
      "MP_WEBHOOK_SECRET",
      "MP_CLIENT_ID",
      "MP_WEBHOOK_TOKEN",
      "MP_PUBLIC_KEY",
    ]);
  });

  it("token e segredo são obrigatórios; o resto não", () => {
    const mp = financeiraPorSlug("mercado-pago");
    const obrigatorias = mp?.campos.filter((c) => c.obrigatorio).map((c) => c.chave);
    // Sem estas duas não se cobra nem se dá baixa. As outras três têm efeito
    // menor e não podem travar quem está configurando.
    expect(obrigatorias).toEqual(["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"]);
  });

  it("o cofre reconhece as chaves do Mercado Pago como dele", () => {
    for (const campo of financeiraPorSlug("mercado-pago")?.campos ?? []) {
      expect(categoriaDaChave(campo.chave)).toBe("mercadopago");
    }
  });

  it("o que é segredo é tratado como segredo, e o que é público não", () => {
    // A máscara e o botão de revelar dependem disto: marcar um Client ID como
    // segredo treina o time a clicar em "revelar" sem pensar.
    expect(ehSegredo("MP_ACCESS_TOKEN")).toBe(true);
    expect(ehSegredo("MP_WEBHOOK_SECRET")).toBe(true);
    expect(ehSegredo("MP_CLIENT_ID")).toBe(false);
    expect(ehSegredo("MP_PUBLIC_KEY")).toBe(false);
  });

  it("Wise e Nubank não inventam campo", () => {
    // A regra da casa: tela não finge integração que não existe. As duas têm
    // ficha e aviso, e nenhuma chave.
    for (const slug of ["wise", "nubank"]) {
      const financeira = financeiraPorSlug(slug);
      expect(financeira?.campos).toEqual([]);
      expect(financeira?.aviso, `${slug} precisa dizer por que está vazia`).toBeTruthy();
    }
  });

  it("toda financeira diz qual é o papel dela no dinheiro da casa", () => {
    for (const financeira of FINANCEIRAS) {
      expect(financeira.papel.length, financeira.slug).toBeGreaterThan(10);
      for (const campo of financeira.campos) {
        expect(campo.ajuda.length, `${financeira.slug}/${campo.chave}`).toBeGreaterThan(10);
      }
    }
  });

  it("slug desconhecido não vira ficha em branco", () => {
    expect(financeiraPorSlug("banco-inventado")).toBeNull();
  });
});
