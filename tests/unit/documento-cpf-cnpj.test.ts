import { describe, expect, it } from "vitest";
import {
  classifyCpfCnpj,
  isValidCnpj,
  isValidCpf,
  normalizarDocumento,
} from "@/lib/cpf-cnpj";

/**
 * Dígito verificador de CPF e CNPJ.
 *
 * A mesma regra está no banco (`operations.cpf_valido`,
 * `operations.cnpj_valido`). Os casos daqui são os mesmos de
 * `tests/integration/cadastro-fiscal.test.ts`, de propósito: se as duas
 * implementações divergirem, uma das duas suítes reprova.
 */

describe("normalizarDocumento", () => {
  it("tira pontuação e sobe para maiúsculas", () => {
    expect(normalizarDocumento("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizarDocumento("12abc34501de35")).toBe("12ABC34501DE35");
    expect(normalizarDocumento("")).toBe("");
  });
});

describe("isValidCpf", () => {
  it("aceita CPF com dígito verificador correto, com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(isValidCpf("52998224726")).toBe(false);
  });

  it("recusa o mesmo dígito repetido, que fecha no módulo 11 e não é de ninguém", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("recusa tamanho diferente de 11", () => {
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("529982247255")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ numérico correto", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
  });

  // IN RFB 2.229/2024, em vigor desde julho de 2026: as doze primeiras
  // posições podem ter letras. "12ABC34501DE35" é o exemplo da própria
  // Receita. Sem isso, cliente aberto depois de julho de 2026 não entra no
  // cadastro.
  it("aceita CNPJ alfanumérico", () => {
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
  });

  it("recusa CNPJ alfanumérico com dígito verificador errado", () => {
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
  });

  it("recusa letra nos dois dígitos verificadores, que são sempre numéricos", () => {
    expect(isValidCnpj("12ABC34501DEAB")).toBe(false);
  });
});

describe("classifyCpfCnpj", () => {
  it("classifica e normaliza", () => {
    expect(classifyCpfCnpj("529.982.247-25")).toEqual({
      kind: "CPF",
      documento: "52998224725",
      valid: true,
    });
    expect(classifyCpfCnpj("11.222.333/0001-81")).toEqual({
      kind: "CNPJ",
      documento: "11222333000181",
      valid: true,
    });
  });

  it("classifica mesmo quando o dígito está errado, dizendo que não vale", () => {
    expect(classifyCpfCnpj("11222333000182")).toEqual({
      kind: "CNPJ",
      documento: "11222333000182",
      valid: false,
    });
  });

  it("devolve nulo quando o tamanho não é de CPF nem de CNPJ", () => {
    expect(classifyCpfCnpj("123456789")).toBeNull();
    expect(classifyCpfCnpj("")).toBeNull();
  });
});
