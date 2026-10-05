import { describe, expect, it } from "vitest";
import {
  bytesParaCanonico,
  canonicoParaBytes,
  daApresentacao,
  deTextoPuro,
  ehTxtDeApresentacao,
  paraApresentacao,
  paraTextoPuro,
  pedacosDe255Bytes,
} from "@/lib/dominios/dns/conteudo";
import { zonaParaBind } from "@/lib/dominios/dns/bind";
import { achatar, montarConteudo } from "@/lib/dominios/dns/rrset";
import { diferencaParaVersao, paraLinha, zonaIgual } from "@/lib/dominios/dns/versoes";
import type { RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * A forma canônica do conteúdo: TXT como bytes escritos com os escapes da
 * RFC 1035, sem aspas; host sem ponto final. A regra que estes testes seguram
 * é ida e volta sem perda — servidor da casa, serviço externo, banco e BIND —
 * para qualquer byte, inclusive os que não são texto.
 */

const Z = "x.com.br";
function r(tipo: string, nome: string, conteudo: string, extra: Partial<RegistroDns> = {}): RegistroDns {
  return { id: `${tipo}|${nome}|${conteudo}`, tipo, nome, conteudo, ttl: 1, proxy: false, prioridade: null, ...extra };
}

describe("bytes ⇄ forma canônica", () => {
  it("texto UTF-8 imprimível fica literal; barra vira \\\\", () => {
    expect(bytesParaCanonico(new TextEncoder().encode("café a\\b"))).toBe("café a\\\\b");
  });

  it("controle, NUL e byte fora de UTF-8 viram \\DDD — texto seguro para JSONB", () => {
    const canonico = bytesParaCanonico([0x00, 0x0a, 0x7f, 0xff, 0x41]);
    expect(canonico).toBe("\\000\\010\\127\\255A");
    expect(JSON.stringify(canonico)).not.toContain("\\u0000");
  });

  it("BOM no meio do texto é conteúdo, não some", () => {
    expect(canonicoParaBytes(bytesParaCanonico([0x61, 0xef, 0xbb, 0xbf, 0x62]))).toEqual([0x61, 0xef, 0xbb, 0xbf, 0x62]);
  });

  it("caractere real da área de uso privado não é confundido com byte solto", () => {
    const bytes = [...new TextEncoder().encode("")];
    expect(canonicoParaBytes(bytesParaCanonico(bytes))).toEqual(bytes);
  });

  it("ida e volta para todos os 256 bytes", () => {
    const todos = Array.from({ length: 256 }, (_, i) => i);
    expect(canonicoParaBytes(bytesParaCanonico(todos))).toEqual(todos);
  });
});

describe("fronteira com o servidor da casa (apresentação)", () => {
  it("TXT entre aspas e em pedaços vira um texto só", () => {
    expect(daApresentacao("TXT", '"v=spf1 include:a.com" " ~all"')).toBe("v=spf1 include:a.com ~all");
    expect(daApresentacao("TXT", '"a\\032b"')).toBe("a b");
    expect(daApresentacao("TXT", '"caf\\195\\169"')).toBe("café");
    expect(daApresentacao("TXT", '"diz \\"oi\\""')).toBe('diz "oi"');
  });

  it("ida e volta: aspas, barra, controle e byte solto", () => {
    for (const apresentacao of ['"diz \\"oi\\""', '"a\\\\b"', '"a\\010b"', '"a\\255b"', '"\\000"']) {
      expect(paraApresentacao("TXT", daApresentacao("TXT", apresentacao))).toBe(apresentacao);
    }
  });

  it("host ganha e perde o ponto final; a raiz '.' fica", () => {
    expect(daApresentacao("MX", "mx1.provedor.com.")).toBe("mx1.provedor.com");
    expect(paraApresentacao("CNAME", "x.com.br")).toBe("x.com.br.");
    expect(daApresentacao("MX", ".")).toBe(".");
    expect(daApresentacao("SRV", "0 0 .")).toBe("0 0 .");
    expect(paraApresentacao("MX", ".")).toBe(".");
  });

  it("o adaptador da casa lê e escreve na fronteira", () => {
    const linhas = achatar([
      { name: "x.com.br.", type: "TXT", ttl: 1, records: [{ content: '"v=spf1 -all"' }] },
      { name: "x.com.br.", type: "MX", ttl: 1, records: [{ content: "10 mx1.provedor.com." }] },
    ]);
    expect(linhas.map((l) => l.conteudo)).toEqual(["v=spf1 -all", "mx1.provedor.com"]);
    expect(montarConteudo({ tipo: "TXT", nome: Z, conteudo: "v=spf1 -all" })).toBe('"v=spf1 -all"');
    expect(montarConteudo({ tipo: "TXT", nome: Z, conteudo: '"sale"' })).toBe('"\\"sale\\""');
    expect(montarConteudo({ tipo: "MX", nome: Z, conteudo: ".", prioridade: 0 })).toBe("0 .");
  });

  it("reconhece TXT em forma de apresentação só quando é inteiro entre aspas", () => {
    expect(ehTxtDeApresentacao('"a" "b"')).toBe(true);
    expect(ehTxtDeApresentacao('"sale" de verão')).toBe(false);
  });
});

describe("fronteira com o serviço externo (texto puro)", () => {
  it("texto com aspas e barra vai e volta igual", () => {
    for (const texto of ['"sale"', "a\\b", "café", "linha1\nlinha2"]) {
      expect(paraTextoPuro("TXT", deTextoPuro("TXT", texto))).toBe(texto);
    }
  });

  it("byte fora de UTF-8 é recusado em vez de trocado", () => {
    expect(() => paraTextoPuro("TXT", "a\\255b")).toThrow(/UTF-8/);
  });

  it("zona da casa e zona externa com o mesmo conteúdo não têm diferença", () => {
    const daCasa = achatar([{ name: "x.com.br.", type: "TXT", ttl: 1, records: [{ content: '"v=spf1 -all"' }] }]);
    const externa = [r("TXT", "x.com.br", deTextoPuro("TXT", "v=spf1 -all"))];
    expect(zonaIgual(diferencaParaVersao(externa, daCasa.map(paraLinha), Z))).toBe(true);
  });
});

describe("pedaços de 255 bytes", () => {
  it("conta bytes, não caracteres, sem partir acento", () => {
    const pedacos = pedacosDe255Bytes(canonicoParaBytes("é".repeat(200)));
    expect(pedacos.map((p) => p.length)).toEqual([254, 146]);
  });

  it("byte solto conta como um byte", () => {
    expect(pedacosDe255Bytes(canonicoParaBytes(`a\\255b${"x".repeat(252)}`))).toHaveLength(1);
    expect(pedacosDe255Bytes(canonicoParaBytes(`a\\255b${"x".repeat(253)}`))).toHaveLength(2);
  });

  it("BIND sai com pedaços e sem quebra de linha crua", () => {
    const arquivo = zonaParaBind(Z, [paraLinha(r("TXT", "x.com.br", "linha1\\010linha2"))], { geradoEm: new Date(), origem: "t" });
    expect(arquivo).toContain('"linha1\\010linha2"');
    const longo = zonaParaBind(Z, [paraLinha(r("TXT", "l.x.com.br", "a".repeat(300)))], { geradoEm: new Date(), origem: "t" });
    expect(longo).toContain(`"${"a".repeat(255)}" "${"a".repeat(45)}"`);
  });
});
