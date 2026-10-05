import { describe, expect, it } from "vitest";
import { zonaParaBind } from "@/lib/dominios/dns/bind";
import { daApresentacao, ehDoServidor, normalizarLogico, paraApresentacao, pedacosDe255Bytes } from "@/lib/dominios/dns/conteudo";
import { achatar, montarConteudo } from "@/lib/dominios/dns/rrset";
import type { RegistroDns } from "@/lib/dominios/dns/tipos";
import { diferencaParaVersao, lerLinhas, ordenarLinhas, paraLinha, zonaIgual, type LinhaVersao } from "@/lib/dominios/dns/versoes";

/**
 * Restaurar é aplicar uma diferença. Se ela sair errada, "voltar à versão de
 * ontem" apaga o MX de hoje que também existia ontem. E o BIND é a saída do
 * cliente: um arquivo que outro servidor não importa não serve de saída.
 */

function r(tipo: string, nome: string, conteudo: string, extra: Partial<RegistroDns> = {}): RegistroDns {
  return { id: `${tipo}|${nome}|${conteudo}`, tipo, nome, conteudo, ttl: 1, proxy: false, prioridade: null, ...extra };
}

const Z = "x.com.br";

const ATUAL: RegistroDns[] = [
  r("A", "x.com.br", "203.0.113.10"),
  r("MX", "x.com.br", "mx1.provedor.com", { prioridade: 10 }),
  r("TXT", "x.com.br", "v=spf1 include:novo.com ~all"),
  r("A", "loja.x.com.br", "198.51.100.7", { ttl: 300 }),
];

describe("diferencaParaVersao", () => {
  it("só mexe no que mudou: o MX igual nas duas fica onde está", () => {
    const versao: LinhaVersao[] = [
      paraLinha(r("A", "x.com.br", "203.0.113.10")),
      paraLinha(r("MX", "x.com.br", "mx1.provedor.com", { prioridade: 10 })),
      paraLinha(r("TXT", "x.com.br", "v=spf1 include:antigo.com ~all")),
    ];
    const dif = diferencaParaVersao(ATUAL, versao, Z);
    expect(dif.sair.map((x) => x.conteudo).sort()).toEqual(["198.51.100.7", "v=spf1 include:novo.com ~all"]);
    expect(dif.entrar.map((x) => x.conteudo)).toEqual(["v=spf1 include:antigo.com ~all"]);
    expect(dif.ajustar).toEqual([]);
  });

  it("TTL ou proxy diferente é ajuste da mesma linha, não apagar e criar", () => {
    const versao = ATUAL.map(paraLinha).map((l) => (l.nome === "loja.x.com.br" ? { ...l, ttl: 3600, proxy: true } : l));
    const dif = diferencaParaVersao(ATUAL, versao, Z);
    expect(dif.sair).toEqual([]);
    expect(dif.entrar).toEqual([]);
    expect(dif.ajustar).toHaveLength(1);
    expect(dif.ajustar[0].alvo).toMatchObject({ ttl: 3600, proxy: true });
  });

  it("prioridade faz parte da linha: MX 10 e MX 20 para o mesmo host são linhas diferentes", () => {
    const versao = ATUAL.map(paraLinha).map((l) => (l.tipo === "MX" ? { ...l, prioridade: 20 } : l));
    const dif = diferencaParaVersao(ATUAL, versao, Z);
    expect(dif.sair.map((x) => x.tipo)).toEqual(["MX"]);
    expect(dif.entrar.map((x) => x.prioridade)).toEqual([20]);
  });

  it("nome com ou sem ponto final e em maiúscula é o mesmo nome", () => {
    const versao = ATUAL.map(paraLinha).map((l) => ({ ...l, nome: `${l.nome.toUpperCase()}.` }));
    expect(zonaIgual(diferencaParaVersao(ATUAL, versao, Z))).toBe(true);
  });

  it("linhas repetidas são contadas uma a uma", () => {
    const duplicada = [...ATUAL, r("A", "x.com.br", "203.0.113.10", { id: "outra" })];
    const dif = diferencaParaVersao(duplicada, ATUAL.map(paraLinha), Z);
    expect(dif.sair).toHaveLength(1);
  });

  it("versão vazia apaga tudo; zona vazia recria tudo", () => {
    expect(diferencaParaVersao(ATUAL, [], Z).sair).toHaveLength(4);
    expect(diferencaParaVersao([], ATUAL.map(paraLinha), Z).entrar).toHaveLength(4);
  });
});

describe("lerLinhas", () => {
  it("descarta o que não tem forma de linha e completa o que falta", () => {
    expect(lerLinhas(null)).toEqual([]);
    expect(lerLinhas([{ tipo: "A" }, { tipo: "A", nome: "a", conteudo: "1.2.3.4" }])).toEqual([
      { tipo: "A", nome: "a", conteudo: "1.2.3.4", ttl: 1, prioridade: null, proxy: false },
    ]);
  });
});

describe("zonaParaBind", () => {
  const linhas = ordenarLinhas([
    ...ATUAL.map(paraLinha),
    paraLinha(r("CNAME", "www.x.com.br", "x.com.br")),
    paraLinha(r("TXT", "_dmarc.x.com.br", "v=DMARC1; p=none")),
    paraLinha(r("TXT", "longo.x.com.br", "a".repeat(300))),
  ]);
  const arquivo = zonaParaBind("x.com.br", linhas, { geradoEm: new Date("2026-10-04T12:00:00Z"), origem: "teste" });

  it("tem $ORIGIN e nomes absolutos", () => {
    expect(arquivo).toContain("$ORIGIN x.com.br.");
    expect(arquivo).toContain("www.x.com.br.\t300\tIN\tCNAME\tx.com.br.");
  });

  it("MX leva a prioridade antes do host, com ponto final", () => {
    expect(arquivo).toContain("x.com.br.\t300\tIN\tMX\t10 mx1.provedor.com.");
  });

  it("TTL automático vira 300 e TTL explícito fica", () => {
    expect(arquivo).toContain("loja.x.com.br.\t300\tIN\tA\t198.51.100.7");
    expect(arquivo).toContain("x.com.br.\t300\tIN\tA\t203.0.113.10");
  });

  it("TXT sai entre aspas, uma vez só, e em pedaços de 255", () => {
    expect(arquivo).toContain('_dmarc.x.com.br.\t300\tIN\tTXT\t"v=DMARC1; p=none"');
    const longo = arquivo.split("\n").find((l) => l.startsWith("longo."))!;
    expect(longo).toContain(`"${"a".repeat(255)}" "${"a".repeat(45)}"`);
  });

  it("não inventa SOA nem NS", () => {
    expect(arquivo).not.toMatch(/\tSOA\t|\tNS\t/);
  });
});

describe("registros do servidor", () => {
  it("SOA e NS do próprio domínio são do servidor; NS de subdomínio é do titular", () => {
    expect(ehDoServidor({ tipo: "SOA", nome: "x.com.br." }, Z)).toBe(true);
    expect(ehDoServidor({ tipo: "NS", nome: "x.com.br" }, Z)).toBe(true);
    expect(ehDoServidor({ tipo: "NS", nome: "loja.x.com.br" }, Z)).toBe(false);
  });

  it("ficam fora da diferença: SOA com serial novo não vira apagar e recriar", () => {
    const soaHoje = r("SOA", "x.com.br", "ns1.avilaops.com. hostmaster. 2026100502 10800 3600 604800 3600");
    const soaOntem = paraLinha(r("SOA", "x.com.br", "ns1.avilaops.com. hostmaster. 2026100401 10800 3600 604800 3600"));
    const dif = diferencaParaVersao([...ATUAL, soaHoje], [...ATUAL.map(paraLinha), soaOntem], Z);
    expect(zonaIgual(dif)).toBe(true);
  });

  it("ficam fora do BIND", () => {
    const arquivo = zonaParaBind(Z, [paraLinha(r("SOA", "x.com.br", "ns1. h. 1 2 3 4 5")), paraLinha(r("NS", "x.com.br", "ns1.avilaops.com."))], {
      geradoEm: new Date(),
      origem: "t",
    });
    expect(arquivo).not.toMatch(/\tSOA\t|\tNS\t/);
  });
});

describe("conteúdo igual entre servidores", () => {
  it("TXT entre aspas e em pedaços vira o mesmo texto lógico", () => {
    expect(daApresentacao("TXT", '"v=spf1 include:a.com" " ~all"')).toBe("v=spf1 include:a.com ~all");
    expect(daApresentacao("TXT", '"diz \\"oi\\""')).toBe('diz "oi"');
    expect(daApresentacao("TXT", "v=spf1 -all")).toBe("v=spf1 -all");
  });

  it("host com ou sem ponto final é o mesmo host", () => {
    expect(daApresentacao("MX", "mx1.provedor.com.")).toBe("mx1.provedor.com");
    expect(normalizarLogico("MX", "mx1.provedor.com.")).toBe("mx1.provedor.com");
  });

  it("versão do servidor da casa e zona do serviço externo não aparecem como diferentes", () => {
    // O adaptador da casa já entrega forma lógica: a conversão mora nele.
    const daCasa = achatar([
      { name: "x.com.br.", type: "TXT", ttl: 1, records: [{ content: '"v=spf1 -all"' }] },
      { name: "x.com.br.", type: "MX", ttl: 1, records: [{ content: "10 mx1.provedor.com." }] },
    ]);
    expect(daCasa.map((l) => l.conteudo)).toEqual(["v=spf1 -all", "mx1.provedor.com"]);
    const externa = [r("TXT", "x.com.br", "v=spf1 -all"), r("MX", "x.com.br", "mx1.provedor.com", { prioridade: 10 })];
    expect(zonaIgual(diferencaParaVersao(externa, daCasa.map(paraLinha), Z))).toBe(true);
  });

  it("o servidor da casa recebe TXT entre aspas e host com ponto final", () => {
    expect(montarConteudo({ tipo: "TXT", nome: Z, conteudo: "v=spf1 -all" })).toBe('"v=spf1 -all"');
    // Entrada é sempre lógica: aspas digitadas são conteúdo e levam escape.
    expect(montarConteudo({ tipo: "TXT", nome: Z, conteudo: '"sale"' })).toBe('"\\"sale\\""');
    expect(montarConteudo({ tipo: "MX", nome: Z, conteudo: "mx1.provedor.com", prioridade: 10 })).toBe("10 mx1.provedor.com.");
    expect(paraApresentacao("CNAME", "x.com.br")).toBe("x.com.br.");
  });

  it("TXT é cortado por bytes, sem partir acento no meio", () => {
    const pedacos = pedacosDe255Bytes("é".repeat(200));
    expect(pedacos.map((p) => new TextEncoder().encode(p).length)).toEqual([254, 146]);
    expect(pedacos.join("")).toBe("é".repeat(200));
  });
});

describe("revisão do #80", () => {
  it("escape decimal do TXT é um byte, e bytes UTF-8 voltam a ser o caractere", () => {
    expect(daApresentacao("TXT", '"a\\032b"')).toBe("a b");
    expect(daApresentacao("TXT", '"caf\\195\\169"')).toBe("café");
    expect(daApresentacao("TXT", '"diz \\"oi\\""')).toBe('diz "oi"');
  });

  it("alvo raiz '.' do MX nulo e do SRV indisponível não vira texto vazio", () => {
    expect(daApresentacao("MX", ".")).toBe(".");
    expect(daApresentacao("SRV", "0 0 .")).toBe("0 0 .");
    expect(paraApresentacao("MX", ".")).toBe(".");
    expect(montarConteudo({ tipo: "MX", nome: Z, conteudo: ".", prioridade: 0 })).toBe("0 .");
  });

  it("versão guardada é lida normalizada: tipo, nome e host", () => {
    const [linha] = lerLinhas([{ tipo: "mx", nome: "X.com.br.", conteudo: "mx1.provedor.com.", ttl: 300, prioridade: 10, proxy: false }]);
    expect(linha).toMatchObject({ tipo: "MX", nome: "x.com.br", conteudo: "mx1.provedor.com" });
  });
});

describe("revisão do #80, terceira rodada", () => {
  it("byte de controle do TXT vai e volta como escape decimal", () => {
    expect(daApresentacao("TXT", '"a\\010b"')).toBe("a\nb");
    expect(paraApresentacao("TXT", "a\nb\tc")).toBe('"a\\010b\\009c"');
    expect(daApresentacao("TXT", paraApresentacao("TXT", "a\nb"))).toBe("a\nb");
  });

  it("BIND não sai com quebra de linha no meio de um TXT", () => {
    const arquivo = zonaParaBind(Z, [paraLinha(r("TXT", "x.com.br", "linha1\nlinha2"))], { geradoEm: new Date(), origem: "t" });
    expect(arquivo).toContain('"linha1\\010linha2"');
  });
});

describe("revisão do #80, quarta rodada", () => {
  it("TXT lógico que começa com aspas mantém as aspas: são conteúdo", () => {
    expect(paraLinha(r("TXT", "x.com.br", '"sale"')).conteudo).toBe('"sale"');
    const [linha] = lerLinhas([{ tipo: "TXT", nome: "x.com.br", conteudo: '"sale"', ttl: 1, prioridade: null, proxy: false }]);
    expect(linha.conteudo).toBe('"sale"');
    expect(zonaIgual(diferencaParaVersao([r("TXT", "x.com.br", '"sale"')], [linha], Z))).toBe(true);
  });

  it("byte fora de UTF-8 no TXT vai e volta sem virar caractere de substituição", () => {
    const logico = daApresentacao("TXT", '"a\\255b"');
    expect(logico).not.toContain("\uFFFD");
    expect(paraApresentacao("TXT", logico)).toBe('"a\\255b"');
    // "a" + byte solto + "b" são 3 bytes, não 5: 3 + 252 = 255 cabe num pedaço.
    expect(pedacosDe255Bytes(logico + "x".repeat(252))).toHaveLength(1);
    expect(pedacosDe255Bytes(logico + "x".repeat(253))).toHaveLength(2);
  });

  it("acento continua acento mesmo ao lado de byte solto", () => {
    expect(paraApresentacao("TXT", daApresentacao("TXT", '"caf\\195\\169\\255"'))).toBe('"café\\255"');
  });
});

