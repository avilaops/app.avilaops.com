import { describe, expect, it } from "vitest";
import { ehDominioValido, normalizeDomainInput } from "@/lib/dominio";

describe("domínio colado como URL", () => {
  it("fica só o host, sem www, caminho, query ou porta", () => {
    expect(normalizeDomainInput("https://www.pkvedacoes.com.br/")).toBe("pkvedacoes.com.br");
    expect(normalizeDomainInput("https://empresa.com.br:8443/contato?x=1")).toBe("empresa.com.br");
    expect(normalizeDomainInput("Empresa.com.br#topo")).toBe("empresa.com.br");
  });

  it("acento vira Punycode em vez de sumir", () => {
    expect(normalizeDomainInput("café.com.br")).toBe("xn--caf-dma.com.br");
    expect(normalizeDomainInput("https://www.Café.com.br/")).toBe("xn--caf-dma.com.br");
    expect(ehDominioValido(normalizeDomainInput("café.com.br"))).toBe(true);
  });

  it("caractere que não cabe em domínio é reprovado, não apagado", () => {
    expect(ehDominioValido(normalizeDomainInput("emp resa.com.br"))).toBe(false);
    expect(ehDominioValido(normalizeDomainInput("exa_mple.com.br"))).toBe(false);
  });

  it("ponto final do FQDN sai", () => {
    expect(normalizeDomainInput("empresa.com.br.")).toBe("empresa.com.br");
  });
});
