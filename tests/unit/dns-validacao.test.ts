import { describe, expect, it } from "vitest";
import { nomeCompleto, validarRegistroDns, type ContextoValidacao } from "@/lib/dominios/dns/validacao";
import type { RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * Cada regra aqui é um jeito de derrubar site ou e-mail sem que o servidor de
 * DNS reclame. Desde que o cliente edita a própria zona pelo portal, é esta
 * validação que fica entre ele e o erro.
 */

function registro(tipo: string, nome: string, conteudo: string, id = `${tipo}-${nome}-${conteudo}`): RegistroDns {
  return { id, tipo, nome, conteudo, ttl: 1, proxy: false, prioridade: tipo === "MX" ? 10 : null };
}

const ZONA = "cliente.com.br";

const EXISTENTES: RegistroDns[] = [
  registro("A", "cliente.com.br", "203.0.113.10", "a-apex"),
  registro("MX", "cliente.com.br", "mx1.provedor.com", "mx-1"),
  registro("TXT", "cliente.com.br", '"v=spf1 include:_spf.provedor.com ~all"', "spf-apex"),
  registro("CNAME", "www.cliente.com.br", "cliente.com.br", "cname-www"),
];

function ctx(extra: Partial<ContextoValidacao> = {}): ContextoValidacao {
  return { zona: ZONA, existentes: EXISTENTES, permiteCnameNoApex: false, ...extra };
}

describe("nomeCompleto", () => {
  it("trata @, vazio e o próprio domínio como o apex", () => {
    expect(nomeCompleto("@", ZONA)).toBe(ZONA);
    expect(nomeCompleto("", ZONA)).toBe(ZONA);
    expect(nomeCompleto("Cliente.com.br.", ZONA)).toBe(ZONA);
  });

  it("completa nome relativo com a zona", () => {
    expect(nomeCompleto("www", ZONA)).toBe("www.cliente.com.br");
    expect(nomeCompleto("_dmarc.cliente.com.br", ZONA)).toBe("_dmarc.cliente.com.br");
  });
});

describe("validarRegistroDns", () => {
  it("aceita registro comum", () => {
    expect(validarRegistroDns({ tipo: "A", nome: "loja", conteudo: "198.51.100.7", ttl: 300 }, ctx())).toEqual([]);
    expect(
      validarRegistroDns({ tipo: "TXT", nome: "_dmarc", conteudo: "v=DMARC1; p=none" }, ctx()),
    ).toEqual([]);
  });

  it("recusa A com algo que não é IPv4 e AAAA com algo que não é IPv6", () => {
    expect(validarRegistroDns({ tipo: "A", nome: "loja", conteudo: "site.com" }, ctx())[0].campo).toBe("conteudo");
    expect(validarRegistroDns({ tipo: "AAAA", nome: "loja", conteudo: "203.0.113.1" }, ctx())[0].campo).toBe("conteudo");
    expect(validarRegistroDns({ tipo: "AAAA", nome: "loja", conteudo: "2001:db8::1" }, ctx())).toEqual([]);
  });

  it("recusa segundo SPF no mesmo nome, que invalidaria os dois", () => {
    const problemas = validarRegistroDns(
      { tipo: "TXT", nome: "@", conteudo: "v=spf1 include:outro.com -all" },
      ctx(),
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0].mensagem).toMatch(/SPF/);
  });

  it("deixa trocar o SPF existente por outro", () => {
    expect(
      validarRegistroDns(
        { tipo: "TXT", nome: "@", conteudo: "v=spf1 include:outro.com -all" },
        ctx({ substituindoId: "spf-apex" }),
      ),
    ).toEqual([]);
  });

  it("aceita SPF em outro nome", () => {
    expect(validarRegistroDns({ tipo: "TXT", nome: "envio", conteudo: "v=spf1 -all" }, ctx())).toEqual([]);
  });

  it("recusa MX apontando para IP e MX sem prioridade", () => {
    const comIp = validarRegistroDns({ tipo: "MX", nome: "@", conteudo: "203.0.113.25", prioridade: 10 }, ctx());
    expect(comIp.map((p) => p.campo)).toEqual(["conteudo"]);
    const semPrioridade = validarRegistroDns({ tipo: "MX", nome: "@", conteudo: "mx2.provedor.com" }, ctx());
    expect(semPrioridade.map((p) => p.campo)).toEqual(["prioridade"]);
  });

  it("recusa CNAME dividindo nome com outro registro", () => {
    const problemas = validarRegistroDns({ tipo: "CNAME", nome: "@", conteudo: "site.plataforma.com" }, ctx({ permiteCnameNoApex: true }));
    expect(problemas.some((p) => /divide o nome/.test(p.mensagem))).toBe(true);
  });

  it("recusa registro novo num nome que já é CNAME", () => {
    const problemas = validarRegistroDns({ tipo: "TXT", nome: "www", conteudo: "verificacao=123" }, ctx());
    expect(problemas[0].mensagem).toMatch(/já é um CNAME/);
  });

  it("deixa alterar o próprio CNAME", () => {
    expect(
      validarRegistroDns(
        { tipo: "CNAME", nome: "www", conteudo: "site.plataforma.com" },
        ctx({ substituindoId: "cname-www" }),
      ),
    ).toEqual([]);
  });

  it("recusa CNAME no apex só onde não há achatamento", () => {
    const zonaVazia = ctx({ existentes: [] });
    const semAchatar = validarRegistroDns({ tipo: "CNAME", nome: "@", conteudo: "site.plataforma.com" }, zonaVazia);
    expect(semAchatar.map((p) => p.campo)).toEqual(["nome"]);
    const comAchatar = validarRegistroDns(
      { tipo: "CNAME", nome: "@", conteudo: "site.plataforma.com" },
      { ...zonaVazia, permiteCnameNoApex: true },
    );
    expect(comAchatar).toEqual([]);
  });

  it("recusa CNAME para IP", () => {
    const problemas = validarRegistroDns({ tipo: "CNAME", nome: "blog", conteudo: "203.0.113.9" }, ctx());
    expect(problemas.map((p) => p.campo)).toEqual(["conteudo"]);
  });

  it("recusa NS no próprio domínio", () => {
    const problemas = validarRegistroDns({ tipo: "NS", nome: "@", conteudo: "ns1.outro.com" }, ctx());
    expect(problemas.map((p) => p.campo)).toEqual(["nome"]);
    expect(validarRegistroDns({ tipo: "NS", nome: "sub", conteudo: "ns1.outro.com" }, ctx())).toEqual([]);
  });

  it("recusa TTL fora do intervalo, menos o 1 automático", () => {
    expect(validarRegistroDns({ tipo: "A", nome: "x", conteudo: "203.0.113.1", ttl: 1 }, ctx())).toEqual([]);
    expect(validarRegistroDns({ tipo: "A", nome: "x", conteudo: "203.0.113.1", ttl: 5 }, ctx())[0].campo).toBe("ttl");
    expect(
      validarRegistroDns({ tipo: "A", nome: "x", conteudo: "203.0.113.1", ttl: 90_000 }, ctx())[0].campo,
    ).toBe("ttl");
  });

  it("aceita curinga e sublinhado no nome, recusa espaço", () => {
    expect(validarRegistroDns({ tipo: "A", nome: "*", conteudo: "203.0.113.1" }, ctx())).toEqual([]);
    expect(validarRegistroDns({ tipo: "TXT", nome: "_acme-challenge", conteudo: "abc" }, ctx())).toEqual([]);
    expect(validarRegistroDns({ tipo: "A", nome: "minha loja", conteudo: "203.0.113.1" }, ctx())[0].campo).toBe("nome");
  });
});
