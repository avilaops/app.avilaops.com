import { describe, expect, it } from "vitest";
import { normalizeDomainInput } from "@/lib/dominio";

describe("domínio colado como URL", () => {
  it("fica só o host, sem www, caminho, query ou porta", () => {
    expect(normalizeDomainInput("https://www.pkvedacoes.com.br/")).toBe("pkvedacoes.com.br");
    expect(normalizeDomainInput("https://empresa.com.br:8443/contato?x=1")).toBe("empresa.com.br");
    expect(normalizeDomainInput("Empresa.com.br#topo")).toBe("empresa.com.br");
  });
});
