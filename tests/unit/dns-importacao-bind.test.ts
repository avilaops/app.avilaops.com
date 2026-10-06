import { describe, expect, it } from "vitest";
import { zonaParaBind } from "@/lib/dominios/dns/bind";
import { lerTtl, lerZonaBind, validarZonaImportada } from "@/lib/dominios/dns/importacao-bind";
import type { LinhaVersao } from "@/lib/dominios/dns/versoes";

/**
 * O leitor de arquivo de zona: o que entra, o que fica de fora (e por quê) e
 * o que impede a importação. O arquivo vem de outro provedor, escrito do jeito
 * dele; a zona que sai daqui tem de ser a mesma que o BIND leria.
 */

const ZONA = "padaria.com.br";

describe("lerZonaBind", () => {
  it("lê um arquivo típico: $ORIGIN, $TTL, @, nomes relativos, dono herdado e SOA em várias linhas", () => {
    const texto = `
$ORIGIN padaria.com.br.
$TTL 1h
@   IN SOA ns1.provedor.com. hostmaster.provedor.com. (
        2026100601 ; serial
        3600 900 604800 300 )
@         IN  NS    ns1.provedor.com.
@         IN  NS    ns2.provedor.com.
@     300 IN  A     203.0.113.10
          IN  MX    10 mx1.provedor-de-email.com.
          IN  MX    20 mx2
www           CNAME @
_sip._tcp 600 IN SRV 10 5 5060 sip.provedor.com.
loja.padaria.com.br. 1d IN AAAA 2001:db8::1
@   IN  CAA 0 issue "letsencrypt.org"
`;
    const r = lerZonaBind(texto, ZONA);
    expect(r.problemas).toEqual([]);
    expect(r.ignoradas.map((i) => i.motivo)).toEqual([
      "SOA é do servidor que hospeda a zona.",
      "Os NS do próprio domínio são definidos no registro do domínio.",
      "Os NS do próprio domínio são definidos no registro do domínio.",
    ]);
    expect(r.linhas).toEqual(
      expect.arrayContaining<LinhaVersao>([
        { tipo: "A", nome: ZONA, conteudo: "203.0.113.10", ttl: 300, prioridade: null, proxy: false },
        // Linha recuada herda o dono e, sem TTL próprio, usa o $TTL.
        { tipo: "MX", nome: ZONA, conteudo: "mx1.provedor-de-email.com", ttl: 3600, prioridade: 10, proxy: false },
        { tipo: "MX", nome: ZONA, conteudo: "mx2.padaria.com.br", ttl: 3600, prioridade: 20, proxy: false },
        { tipo: "CNAME", nome: `www.${ZONA}`, conteudo: ZONA, ttl: 3600, prioridade: null, proxy: false },
        { tipo: "SRV", nome: `_sip._tcp.${ZONA}`, conteudo: "5 5060 sip.provedor.com", ttl: 600, prioridade: 10, proxy: false },
        { tipo: "AAAA", nome: `loja.${ZONA}`, conteudo: "2001:db8::1", ttl: 86400, prioridade: null, proxy: false },
        { tipo: "CAA", nome: ZONA, conteudo: '0 issue "letsencrypt.org"', ttl: 3600, prioridade: null, proxy: false },
      ]),
    );
    expect(r.linhas).toHaveLength(7);
  });

  it("TXT: guarda a divisão em strings, aspas escapadas, ponto e vírgula dentro das aspas e palavra sem aspas", () => {
    const texto = [
      `@ 300 IN TXT "v=spf1 include:_spf.provedor.com ~all"`,
      `dkim 300 IN TXT ( "v=DKIM1; k=rsa; " "p=MIGf" ) ; chave dividida`,
      `aspas 300 IN TXT "ele disse \\"oi\\""`,
      `solto 300 IN TXT palavra outra`,
    ].join("\n");
    const r = lerZonaBind(texto, ZONA);
    expect(r.problemas).toEqual([]);
    const txt = Object.fromEntries(r.linhas.map((l) => [l.nome, l.conteudo]));
    expect(txt[ZONA]).toBe('"v=spf1 include:_spf.provedor.com ~all"');
    expect(txt[`dkim.${ZONA}`]).toBe('"v=DKIM1; k=rsa; " "p=MIGf"');
    expect(txt[`aspas.${ZONA}`]).toBe('"ele disse \\"oi\\""');
    expect(txt[`solto.${ZONA}`]).toBe('"palavra" "outra"');
  });

  it("deixa de fora, listado, o tipo que o painel não gerencia", () => {
    const r = lerZonaBind(`@ 300 IN A 203.0.113.10\n10 300 IN PTR host.\n@ 300 IN DS 1 2 3 ABCD`, ZONA);
    expect(r.linhas).toHaveLength(1);
    expect(r.ignoradas.map((i) => [i.linha, i.motivo])).toEqual([
      [2, "PTR não é gerenciado pelo painel."],
      [3, "DS não é gerenciado pelo painel."],
    ]);
  });

  it("nome fora do domínio, classe que não é IN, $INCLUDE e registro sem TTL são problemas", () => {
    const r = lerZonaBind(
      [
        "outro.com.br. 300 IN A 203.0.113.1",
        "@ 300 CH TXT \"x\"",
        "$INCLUDE outro-arquivo.zone",
        '@ 300 IN TXT "aberto',
      ].join("\n"),
      ZONA,
    );
    expect(r.linhas).toEqual([]);
    expect(r.problemas.map((p) => p.linha)).toEqual([4, 1, 2, 3]);
    expect(r.problemas.map((p) => p.mensagem).join(" | ")).toMatch(/Aspas.*não é de padaria.com.br.*Classe CH.*\$INCLUDE/);
  });

  it("registro sem TTL herda o do anterior (RFC 1035) e, sem anterior nem $TTL, é problema", () => {
    expect(lerZonaBind("semttl IN A 203.0.113.2", ZONA).problemas[0].mensagem).toMatch(/sem TTL/);
    expect(lerZonaBind("a 600 IN A 203.0.113.1\nb IN A 203.0.113.2", ZONA).linhas.map((l) => l.ttl)).toEqual([600, 600]);
  });

  it("$ORIGIN muda a base dos nomes relativos, mas não pode sair do domínio", () => {
    const r = lerZonaBind("$ORIGIN loja.padaria.com.br.\nwww 300 IN A 203.0.113.3\n$ORIGIN outro.com.\n", ZONA);
    expect(r.linhas[0].nome).toBe(`www.loja.${ZONA}`);
    expect(r.problemas[0].mensagem).toMatch(/fora de padaria.com.br/);
  });

  it("lê TTL com unidades", () => {
    expect(lerTtl("3600")).toBe(3600);
    expect(lerTtl("1h30m")).toBe(5400);
    expect(lerTtl("1W")).toBe(604_800);
    expect(lerTtl("www")).toBeNull();
    expect(lerTtl("1x")).toBeNull();
  });

  it("o arquivo que o painel exporta volta igual", () => {
    const linhas: LinhaVersao[] = [
      { tipo: "A", nome: ZONA, conteudo: "203.0.113.10", ttl: 600, prioridade: null, proxy: false },
      { tipo: "MX", nome: ZONA, conteudo: "mx1.provedor.com", ttl: 3600, prioridade: 10, proxy: false },
      { tipo: "TXT", nome: ZONA, conteudo: '"v=spf1 -all"', ttl: 3600, prioridade: null, proxy: false },
      { tipo: "TXT", nome: `bin.${ZONA}`, conteudo: '"a\\000b" ""', ttl: 3600, prioridade: null, proxy: false },
      { tipo: "MX", nome: `nulo.${ZONA}`, conteudo: ".", ttl: 3600, prioridade: 0, proxy: false },
    ];
    const arquivo = zonaParaBind(ZONA, linhas, { geradoEm: new Date("2026-10-06T12:00:00Z"), origem: "teste" });
    const r = lerZonaBind(arquivo, ZONA);
    expect(r.problemas).toEqual([]);
    expect(r.linhas).toEqual(expect.arrayContaining(linhas));
    expect(r.linhas).toHaveLength(linhas.length);
  });
});

describe("validarZonaImportada", () => {
  it("aplica as regras do painel à zona que o arquivo quer deixar", () => {
    const r = lerZonaBind(
      [
        `@ 300 IN TXT "v=spf1 include:a.com ~all"`,
        `@ 300 IN TXT "v=spf1 include:b.com ~all"`,
        `www 300 IN CNAME outro.com.`,
        `www 300 IN A 203.0.113.1`,
        `@ 300 IN MX 10 203.0.113.9`,
      ].join("\n"),
      ZONA,
    );
    const problemas = validarZonaImportada(r.linhas, ZONA, false).join(" | ");
    expect(problemas).toMatch(/SPF/);
    expect(problemas).toMatch(/CNAME/);
    expect(problemas).toMatch(/MX aponta para o nome/);
  });

  it("uma zona limpa não tem problema", () => {
    const r = lerZonaBind(`@ 300 IN A 203.0.113.1\nwww 300 IN CNAME @`, ZONA);
    expect(validarZonaImportada(r.linhas, ZONA, false)).toEqual([]);
  });
});
