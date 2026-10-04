import { describe, expect, it } from "vitest";
import { zonaParaBind } from "@/lib/dominios/dns/bind";
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
    const dif = diferencaParaVersao(ATUAL, versao);
    expect(dif.sair.map((x) => x.conteudo).sort()).toEqual(["198.51.100.7", "v=spf1 include:novo.com ~all"]);
    expect(dif.entrar.map((x) => x.conteudo)).toEqual(["v=spf1 include:antigo.com ~all"]);
    expect(dif.ajustar).toEqual([]);
  });

  it("TTL ou proxy diferente é ajuste da mesma linha, não apagar e criar", () => {
    const versao = ATUAL.map(paraLinha).map((l) => (l.nome === "loja.x.com.br" ? { ...l, ttl: 3600, proxy: true } : l));
    const dif = diferencaParaVersao(ATUAL, versao);
    expect(dif.sair).toEqual([]);
    expect(dif.entrar).toEqual([]);
    expect(dif.ajustar).toHaveLength(1);
    expect(dif.ajustar[0].alvo).toMatchObject({ ttl: 3600, proxy: true });
  });

  it("prioridade faz parte da linha: MX 10 e MX 20 para o mesmo host são linhas diferentes", () => {
    const versao = ATUAL.map(paraLinha).map((l) => (l.tipo === "MX" ? { ...l, prioridade: 20 } : l));
    const dif = diferencaParaVersao(ATUAL, versao);
    expect(dif.sair.map((x) => x.tipo)).toEqual(["MX"]);
    expect(dif.entrar.map((x) => x.prioridade)).toEqual([20]);
  });

  it("nome com ou sem ponto final e em maiúscula é o mesmo nome", () => {
    const versao = ATUAL.map(paraLinha).map((l) => ({ ...l, nome: `${l.nome.toUpperCase()}.` }));
    expect(zonaIgual(diferencaParaVersao(ATUAL, versao))).toBe(true);
  });

  it("linhas repetidas são contadas uma a uma", () => {
    const duplicada = [...ATUAL, r("A", "x.com.br", "203.0.113.10", { id: "outra" })];
    const dif = diferencaParaVersao(duplicada, ATUAL.map(paraLinha));
    expect(dif.sair).toHaveLength(1);
  });

  it("versão vazia apaga tudo; zona vazia recria tudo", () => {
    expect(diferencaParaVersao(ATUAL, []).sair).toHaveLength(4);
    expect(diferencaParaVersao([], ATUAL.map(paraLinha)).entrar).toHaveLength(4);
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
    paraLinha(r("TXT", "_dmarc.x.com.br", '"v=DMARC1; p=none"')),
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

  it("TXT entre aspas, sem aspas dobradas, e em pedaços de 255", () => {
    expect(arquivo).toContain('_dmarc.x.com.br.\t300\tIN\tTXT\t"v=DMARC1; p=none"');
    const longo = arquivo.split("\n").find((l) => l.startsWith("longo."))!;
    expect(longo).toContain(`"${"a".repeat(255)}" "${"a".repeat(45)}"`);
  });

  it("não inventa SOA nem NS", () => {
    expect(arquivo).not.toMatch(/\tSOA\t|\tNS\t/);
  });
});
