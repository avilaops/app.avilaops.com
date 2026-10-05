import { describe, expect, it } from "vitest";
import {
  daApresentacao,
  deTextoPuro,
  ehTxtDeApresentacao,
  escaparBytes,
  paraApresentacao,
  paraTextoPuro,
  pedacosDe255Bytes,
  segmentosDoTxt,
  txtDeEntrada,
  txtDeTextoPuro,
} from "@/lib/dominios/dns/conteudo";
import { zonaParaBind } from "@/lib/dominios/dns/bind";
import { lerEntradaDns } from "@/lib/dominios/dns/escrita";
import { achatar, montarConteudo } from "@/lib/dominios/dns/rrset";
import { validarRegistroDns } from "@/lib/dominios/dns/validacao";
import { diferencaParaVersao, paraLinha, zonaIgual } from "@/lib/dominios/dns/versoes";
import type { RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * A forma canônica do conteúdo: TXT como forma de apresentação normalizada
 * (strings entre aspas, um só jeito de escrever cada byte); host sem ponto
 * final. A regra que estes testes seguram é ida e volta sem perda — servidor
 * da casa, serviço externo, banco e BIND — para qualquer byte, para as
 * divisões entre strings e para espaço na ponta.
 */

const Z = "x.com.br";
function r(tipo: string, nome: string, conteudo: string, extra: Partial<RegistroDns> = {}): RegistroDns {
  return { id: `${tipo}|${nome}|${conteudo}`, tipo, nome, conteudo, ttl: 1, proxy: false, prioridade: null, ...extra };
}

describe("escape de bytes", () => {
  it("UTF-8 imprimível literal; barra, controle, NUL e byte solto escapados", () => {
    expect(escaparBytes(new TextEncoder().encode("café a\\b"))).toBe("café a\\\\b");
    expect(escaparBytes([0x00, 0x0a, 0x7f, 0xff, 0x41])).toBe("\\000\\010\\127\\255A");
  });

  it("BOM no meio é conteúdo, não some", () => {
    expect(escaparBytes([0x61, 0xef, 0xbb, 0xbf, 0x62])).toBe("a﻿b");
  });

  it("ida e volta para todos os 256 bytes, sem U+0000 no JSON", () => {
    const todos = Array.from({ length: 256 }, (_, i) => i);
    const canonico = `"${escaparBytes(todos).replace(/"/g, '\\"')}"`;
    expect(segmentosDoTxt(canonico)).toEqual([todos]);
    expect(JSON.stringify(canonico)).not.toContain("\\u0000");
  });

  it("caractere real da área de uso privado é texto, não byte", () => {
    const bytes = [...new TextEncoder().encode("")];
    expect(segmentosDoTxt(txtDeTextoPuro(""))).toEqual([bytes]);
  });
});


describe("forma canônica do TXT", () => {
  it("normaliza: um só jeito de escrever cada byte, um espaço entre strings", () => {
    expect(daApresentacao("TXT", '  "\\118=spf1 -all"  ')).toBe('"v=spf1 -all"');
    expect(daApresentacao("TXT", '"a\\032b"')).toBe('"a b"');
    expect(daApresentacao("TXT", '"caf\\195\\169"')).toBe('"café"');
  });

  it("guarda as divisões entre strings: \"foo\" \"bar\" não é \"foobar\"", () => {
    expect(daApresentacao("TXT", '"foo"   "bar"')).toBe('"foo" "bar"');
    expect(daApresentacao("TXT", '"foo" "bar"')).not.toBe(daApresentacao("TXT", '"foobar"'));
    expect(zonaIgual(diferencaParaVersao([r("TXT", Z, '"foo" "bar"')], [paraLinha(r("TXT", Z, '"foobar"'))], Z))).toBe(false);
  });

  it("guarda espaço na ponta e TXT vazio", () => {
    expect(daApresentacao("TXT", '" leading "')).toBe('" leading "');
    expect(daApresentacao("TXT", '""')).toBe('""');
    // A tela apara o campo; as aspas protegem o que é conteúdo.
    expect(lerEntradaDns({ tipo: "TXT", nome: "@", conteudo: '  " leading "  ' }).conteudo).toBe('" leading "');
    expect(lerEntradaDns({ tipo: "TXT", nome: "@", conteudo: '""' }).conteudo).toBe('""');
  });

  it("o que se digita sem aspas é o texto", () => {
    expect(txtDeEntrada("v=spf1 -all")).toBe('"v=spf1 -all"');
    expect(txtDeEntrada('diz "oi"')).toBe('"diz \\"oi\\""');
    expect(ehTxtDeApresentacao('"sale" de verão')).toBe(false);
  });

  it("SPF escrito com escape não escapa da regra de SPF duplicado", () => {
    const entrada = lerEntradaDns({ tipo: "TXT", nome: "@", conteudo: '"\\118=spf1 -all"' });
    const problemas = validarRegistroDns(entrada, {
      zona: Z,
      existentes: [r("TXT", Z, '"v=spf1 include:a.com ~all"')],
      permiteCnameNoApex: false,
    });
    expect(problemas[0]?.mensagem).toMatch(/SPF/);
  });

  it("texto maior que 255 bytes vira várias strings, sem partir acento", () => {
    const segmentos = segmentosDoTxt(txtDeTextoPuro("é".repeat(200)));
    expect(segmentos.map((s) => s.length)).toEqual([254, 146]);
    expect(pedacosDe255Bytes([0x61, 0xff, ...Array(253).fill(0x78)])).toHaveLength(1);
  });
});

describe("fronteira com o servidor da casa (apresentação)", () => {
  it("lê e escreve sem perda: aspas, barra, controle, byte solto, divisões", () => {
    for (const apresentacao of ['"diz \\"oi\\""', '"a\\\\b"', '"a\\010b"', '"a\\255b"', '"\\000"', '"foo" "bar"', '""']) {
      expect(paraApresentacao("TXT", daApresentacao("TXT", apresentacao))).toBe(apresentacao);
    }
  });

  it("o adaptador da casa entrega e recebe a forma canônica", () => {
    const linhas = achatar([
      { name: "x.com.br.", type: "TXT", ttl: 1, records: [{ content: '"v=spf1" " -all"' }] },
      { name: "x.com.br.", type: "MX", ttl: 1, records: [{ content: "10 mx1.provedor.com." }] },
    ]);
    expect(linhas.map((l) => l.conteudo)).toEqual(['"v=spf1" " -all"', "mx1.provedor.com"]);
    expect(montarConteudo({ tipo: "TXT", nome: Z, conteudo: '"v=spf1 -all"' })).toBe('"v=spf1 -all"');
    expect(montarConteudo({ tipo: "MX", nome: Z, conteudo: ".", prioridade: 0 })).toBe("0 .");
  });

  it("host ganha e perde o ponto final; a raiz '.' fica", () => {
    expect(daApresentacao("MX", "mx1.provedor.com.")).toBe("mx1.provedor.com");
    expect(paraApresentacao("CNAME", "x.com.br")).toBe("x.com.br.");
    expect(daApresentacao("SRV", "0 0 .")).toBe("0 0 .");
  });
});

describe("fronteira com o serviço externo (texto puro)", () => {
  it("uma string vai e volta como texto puro, inclusive com aspas e barra", () => {
    for (const texto of ["v=spf1 -all", "a\\b", "café", "linha1\nlinha2"]) {
      expect(paraTextoPuro("TXT", deTextoPuro("TXT", texto))).toBe(texto);
    }
  });

  it("várias strings vão entre aspas, que é como a API as recebe", () => {
    expect(paraTextoPuro("TXT", '"foo" "bar"')).toBe('"foo" "bar"');
    expect(deTextoPuro("TXT", '"foo" "bar"')).toBe('"foo" "bar"');
  });

  it("byte fora de UTF-8 é recusado em vez de trocado", () => {
    expect(() => paraTextoPuro("TXT", '"a\\255b"')).toThrow(/UTF-8/);
  });

  it("zona da casa e zona externa com o mesmo conteúdo não têm diferença", () => {
    const daCasa = achatar([{ name: "x.com.br.", type: "TXT", ttl: 1, records: [{ content: '"v=spf1 -all"' }] }]);
    const externa = [r("TXT", Z, deTextoPuro("TXT", "v=spf1 -all"))];
    expect(zonaIgual(diferencaParaVersao(externa, daCasa.map(paraLinha), Z))).toBe(true);
  });
});

describe("BIND", () => {
  it("sai com as strings e sem quebra de linha crua", () => {
    const arquivo = zonaParaBind(Z, [paraLinha(r("TXT", Z, '"linha1\\010linha2" "fim"'))], { geradoEm: new Date(), origem: "t" });
    expect(arquivo).toContain('"linha1\\010linha2" "fim"');
    const longo = zonaParaBind(Z, [paraLinha(r("TXT", "l.x.com.br", txtDeTextoPuro("a".repeat(300))))], { geradoEm: new Date(), origem: "t" });
    expect(longo).toContain(`"${"a".repeat(255)}" "${"a".repeat(45)}"`);
  });
});
