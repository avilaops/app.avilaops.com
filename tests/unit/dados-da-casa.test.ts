import { describe, expect, it } from "vitest";
import {
  DADOS_VAZIOS,
  faltandoParaNota,
  normalizarDadosFiscais,
  situacaoNaData,
} from "@/lib/dados-da-casa";
import {
  aceitaCampoLivre,
  chaveLivre,
  instituicoesLivres,
  slugDaInstituicao,
} from "@/lib/credenciais-financeiro";

/**
 * Dados fiscais da casa e campos livres de banco.
 *
 * O que vai no cabeçalho de toda nota emitida não pode entrar errado, e chave
 * de banco digitada à mão não pode cair no nome de uma chave que o código lê.
 */

describe("dados fiscais da casa", () => {
  it("normaliza documento, UF e alíquota", () => {
    const { dados, erros } = normalizarDadosFiscais({
      cnpj: "11.222.333/0001-81",
      uf: "sp",
      aliquotaIss: "2,5%",
      cep: "01310-100",
      emailFiscal: "Fiscal@Avilaops.com",
    });
    expect(erros).toEqual([]);
    expect(dados.cnpj).toBe("11222333000181");
    expect(dados.uf).toBe("SP");
    expect(dados.aliquotaIss).toBe(2.5);
    expect(dados.cep).toBe("01310100");
    expect(dados.emailFiscal).toBe("fiscal@avilaops.com");
  });

  it("aceita cadastro vazio: ele se preenche aos poucos", () => {
    const { erros, dados } = normalizarDadosFiscais({});
    expect(erros).toEqual([]);
    expect(dados.aliquotaIss).toBeNull();
  });

  it("recusa CNPJ com dígito verificador errado", () => {
    expect(normalizarDadosFiscais({ cnpj: "11222333000182" }).erros).toContain(
      "CNPJ inválido: confira os dígitos.",
    );
  });

  it("recusa alíquota que é erro de digitação, não regime especial", () => {
    expect(normalizarDadosFiscais({ aliquotaIss: "200" }).erros.length).toBe(1);
  });

  it("recusa regime, UF, CEP e IBGE fora do formato", () => {
    const { erros } = normalizarDadosFiscais({
      regimeTributario: "INVENTADO",
      uf: "XX",
      cep: "123",
      codigoMunicipioIbge: "35",
    });
    expect(erros).toHaveLength(4);
  });

  it("lista o que falta para emitir nota", () => {
    const faltando = faltandoParaNota({ ...DADOS_VAZIOS, cnpj: "11222333000181" });
    expect(faltando).not.toContain("cnpj");
    expect(faltando).toContain("inscricaoMunicipal");
  });

  it("recalcula a validade do certificado no dia da consulta", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(situacaoNaData("2026-10-20T12:00:00Z", agora).status).toBe("EXPIRANDO");
    expect(situacaoNaData("2027-10-01T12:00:00Z", agora).status).toBe("ATIVO");
    expect(situacaoNaData("2026-09-01T12:00:00Z", agora)).toMatchObject({
      status: "EXPIRADO",
      expirado: true,
    });
  });
});

describe("campos livres de banco", () => {
  it("monta a chave sem acento e com o prefixo que nenhum código lê", () => {
    expect(slugDaInstituicao("Banco Inter S.A.")).toBe("banco-inter-s-a");
    expect(chaveLivre("Itaú", "Chave Pix")).toBe("BANCO_ITAU__CHAVE_PIX");
    expect(chaveLivre("Nubank", "Client ID")).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it("recusa nome vazio", () => {
    expect(() => chaveLivre("  ", "Token")).toThrow();
    expect(() => chaveLivre("Nubank", "!!!")).toThrow();
  });

  it("só aceita campo livre onde o código não lê chave", () => {
    expect(aceitaCampoLivre("Nubank")).toBe(true);
    expect(aceitaCampoLivre("Banco Inter")).toBe(true);
    expect(aceitaCampoLivre("Mercado Pago")).toBe(false);
    expect(aceitaCampoLivre("mercado-pago")).toBe(false);
    expect(aceitaCampoLivre("PayPal")).toBe(false);
  });

  it("agrupa as instituições à mão e deixa as do catálogo na ficha delas", () => {
    const lista = instituicoesLivres([
      { chave: "BANCO_INTER__TOKEN", grupo: "Inter" },
      { chave: "BANCO_INTER__CHAVE_PIX", grupo: "Inter" },
      { chave: "BANCO_NUBANK__CONTA", grupo: "Nubank" },
      { chave: "MP_ACCESS_TOKEN", grupo: null },
    ]);
    expect(lista).toEqual([{ slug: "inter", nome: "Inter", total: 2 }]);
  });
});
