import { describe, expect, it } from "vitest";
import { CATALOGO, conferirForma, lerValorDigitado, valorEmTexto } from "@/lib/parametros/catalogo";
import { montarPainel, resumoDoPainel } from "@/lib/parametros/painel";
import { dataDoEvento, escoposDoDominio, resolver, vigenteAte, type VersaoParametro } from "@/lib/parametros/resolver";
import { conflitos, escoposAPartirDe, validarNovaVersao, type EntradaVersao } from "@/lib/parametros/validacao";

/**
 * A camada de parâmetros (POLITICAS-E-PARAMETROS.md do cliente.avilaops.com):
 * versão em vigor na data do evento, escopo mais específico vence, pendente
 * não decide, e política do produto nunca menos protetora que a regra externa.
 */

let seq = 0;
function v(parcial: Partial<VersaoParametro> & Pick<VersaoParametro, "chave" | "valor" | "vigenteDesde">): VersaoParametro {
  seq += 1;
  return {
    id: `v${seq}`,
    camada: parcial.chave.startsWith("produto.") ? "POLITICA_PRODUTO" : "REGRA_EXTERNA",
    escopo: "global",
    estado: "VIGENTE",
    fontes: ["F1"],
    revisarEm: null,
    dono: "Dono do serviço",
    nota: null,
    registradaEm: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    quem: null,
    ...parcial,
  };
}

const TRAVA = "icann.transfer.travaAposTrocaTitularDias";

describe("resolver", () => {
  it("usa a versão em vigor na data do evento, não a de hoje", () => {
    const versoes = [v({ chave: TRAVA, valor: 60, vigenteDesde: "2025-08-21" }), v({ chave: TRAVA, valor: 30, vigenteDesde: "2027-03-01" })];
    expect(resolver(versoes, TRAVA, { data: "2026-10-06" })).toMatchObject({ tipo: "vigente", valor: 60 });
    expect(resolver(versoes, TRAVA, { data: "2027-03-01" })).toMatchObject({ tipo: "vigente", valor: 30 });
    expect(resolver(versoes, TRAVA, { data: "2025-08-20" })).toEqual({ tipo: "ausente" });
  });

  it("escopo mais específico vence: registrador > extensão > global", () => {
    const versoes = [
      v({ chave: TRAVA, valor: 60, vigenteDesde: "2025-01-01" }),
      v({ chave: TRAVA, valor: 45, vigenteDesde: "2025-01-01", escopo: ".br" }),
      v({ chave: TRAVA, valor: 0, vigenteDesde: "2025-01-01", escopo: "registrador:opensrs" }),
    ];
    const data = "2026-01-01";
    expect(resolver(versoes, TRAVA, { escopos: escoposDoDominio("loja.com.br"), data })).toMatchObject({ valor: 45 });
    expect(resolver(versoes, TRAVA, { escopos: escoposDoDominio("loja.com.br", "OpenSRS"), data })).toMatchObject({ valor: 0 });
    expect(resolver(versoes, TRAVA, { escopos: escoposDoDominio("loja.com"), data })).toMatchObject({ valor: 60 });
  });

  it("pendente não decide e não cai para o escopo menos específico", () => {
    const versoes = [
      v({ chave: TRAVA, valor: 60, vigenteDesde: "2025-01-01" }),
      v({ chave: TRAVA, valor: 0, vigenteDesde: "2025-01-01", escopo: "registrador:opensrs", estado: "PENDENTE_DE_CONFIRMACAO" }),
    ];
    const r = resolver(versoes, TRAVA, { escopos: escoposDoDominio("x.com", "opensrs"), data: "2026-01-01" });
    expect(r.tipo).toBe("pendente");
  });

  it("monitorada não é lida: o escopo fica como se não tivesse versão", () => {
    const versoes = [
      v({ chave: TRAVA, valor: 60, vigenteDesde: "2025-01-01" }),
      v({ chave: TRAVA, valor: 10, vigenteDesde: "2025-01-01", escopo: ".io", estado: "MONITORADA" }),
    ];
    expect(resolver(versoes, TRAVA, { escopos: escoposDoDominio("a.io"), data: "2026-01-01" })).toMatchObject({ valor: 60 });
  });

  it("duas versões na mesma data: vale a registrada por último", () => {
    const versoes = [
      v({ chave: TRAVA, valor: 61, vigenteDesde: "2026-10-06", registradaEm: "2026-10-06T10:00:00.000Z" }),
      v({ chave: TRAVA, valor: 60, vigenteDesde: "2026-10-06", registradaEm: "2026-10-06T10:05:00.000Z" }),
    ];
    expect(resolver(versoes, TRAVA, { data: "2026-10-06" })).toMatchObject({ valor: 60 });
    expect(vigenteAte(versoes, versoes[0])).toBe("2026-10-06");
  });

  it("vigente até é o dia anterior à próxima versão do mesmo escopo", () => {
    const a = v({ chave: TRAVA, valor: 60, vigenteDesde: "2025-08-21" });
    const b = v({ chave: TRAVA, valor: 30, vigenteDesde: "2027-03-01" });
    const outroEscopo = v({ chave: TRAVA, valor: 1, vigenteDesde: "2026-01-01", escopo: ".br" });
    expect(vigenteAte([a, b, outroEscopo], a)).toBe("2027-02-28");
    expect(vigenteAte([a, b, outroEscopo], b)).toBeNull();
  });

  it("a data do evento é a de São Paulo", () => {
    // 02:00 UTC do dia 7 ainda é dia 6 em São Paulo.
    expect(dataDoEvento(new Date("2026-10-07T02:00:00Z"))).toBe("2026-10-06");
  });

  it("escopos do domínio vão do mais específico ao global", () => {
    expect(escoposDoDominio("Loja.Com.BR.", "OpenSRS")).toEqual(["registrador:opensrs", ".com.br", ".br", "global"]);
    expect(escoposAPartirDe(".com.br")).toEqual([".com.br", ".br", "global"]);
    expect(escoposAPartirDe("registrador:opensrs")).toEqual(["registrador:opensrs", "global"]);
  });
});

describe("forma do valor", () => {
  it("lê o que foi digitado conforme o tipo da chave", () => {
    expect(lerValorDigitado("inteiro", " 90 ")).toEqual({ valor: 90 });
    expect(lerValorDigitado("listaDeInteiros", "30, 7;1")).toEqual({ valor: [30, 7, 1] });
    expect(lerValorDigitado("intervalo", "26 a 35")).toEqual({ valor: { min: 26, max: 35 } });
    expect(lerValorDigitado("booleano", "Não")).toEqual({ valor: false });
    expect(lerValorDigitado("inteiro", "-1")).toHaveProperty("problema");
    expect(lerValorDigitado("inteiro", "9.5")).toHaveProperty("problema");
    expect(lerValorDigitado("intervalo", "35 a 26")).toHaveProperty("problema");
    expect(lerValorDigitado("listaDeInteiros", "30, sete")).toHaveProperty("problema");
  });

  it("mostra o valor em palavras", () => {
    expect(valorEmTexto("intervalo", { min: 26, max: 35 })).toBe("de 26 a 35");
    expect(valorEmTexto("booleano", false)).toBe("não");
    expect(valorEmTexto("listaDeInteiros", [30, 7, 1])).toBe("30, 7, 1");
  });

  it("o catálogo não repete chave e toda chave tem unidade e uso", () => {
    const chaves = CATALOGO.map((d) => d.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const d of CATALOGO) {
      expect(d.unidade).not.toBe("");
      expect(d.usadoEm.length).toBeGreaterThan(0);
      expect(conferirForma(d.tipo, undefined)).not.toBeNull();
    }
  });
});

const ERRP = [
  v({ chave: "icann.errp.aviso1JanelaDias", valor: { min: 26, max: 35 }, vigenteDesde: "2026-09-16" }),
  v({ chave: "icann.errp.aviso2JanelaDias", valor: { min: 4, max: 10 }, vigenteDesde: "2026-09-16" }),
  v({ chave: "icann.errp.avisoPosVencimentoMaxDias", valor: 5, vigenteDesde: "2026-09-16" }),
];

function entrada(parcial: Partial<EntradaVersao>): EntradaVersao {
  return {
    chave: "produto.avisos.diasAntes",
    valor: [30, 7, 1],
    estado: "VIGENTE",
    vigenteDesde: "2026-10-06",
    fontes: ["externo 02 §5.2"],
    dono: "Dono do serviço",
    ...parcial,
  };
}

describe("validar nova versão", () => {
  const hoje = "2026-10-06";

  it("aceita política que respeita a regra externa", () => {
    expect(validarNovaVersao(entrada({}), ERRP, hoje)).toEqual([]);
  });

  it("recusa política menos protetora que a regra externa", () => {
    const problemas = validarNovaVersao(entrada({ valor: [15, 1] }), ERRP, hoje);
    expect(problemas.join(" ")).toMatch(/entre 26 e 35 dias.*aviso1JanelaDias/);
    const depois = validarNovaVersao(entrada({ chave: "produto.avisos.diasDepois", valor: [7, 10] }), ERRP, hoje);
    expect(depois.join(" ")).toMatch(/até 5 dias/);
  });

  it("pendente não passa pela composição: não decide nada ainda", () => {
    expect(validarNovaVersao(entrada({ valor: [15], estado: "PENDENTE_DE_CONFIRMACAO" }), ERRP, hoje)).toEqual([]);
  });

  it("confere a regra externa em vigor na data de vigência da política", () => {
    const mudanca = [...ERRP, v({ chave: "icann.errp.aviso1JanelaDias", valor: { min: 40, max: 45 }, vigenteDesde: "2027-01-01" })];
    expect(validarNovaVersao(entrada({}), mudanca, hoje)).toEqual([]);
    expect(validarNovaVersao(entrada({ vigenteDesde: "2027-01-01" }), mudanca, hoje).length).toBe(1);
  });

  it("recusa data no passado, chave fora do catálogo, forma errada e sem fonte", () => {
    expect(validarNovaVersao(entrada({ vigenteDesde: "2026-10-05" }), ERRP, hoje).join(" ")).toMatch(/passado/);
    expect(validarNovaVersao(entrada({ vigenteDesde: "2026-02-30" }), ERRP, hoje).join(" ")).toMatch(/data válida/);
    expect(validarNovaVersao(entrada({ chave: "inventada" }), ERRP, hoje)).toEqual(["A chave inventada não existe no catálogo."]);
    expect(validarNovaVersao(entrada({ valor: 30 }), ERRP, hoje).join(" ")).toMatch(/lista/);
    expect(validarNovaVersao(entrada({ fontes: [" "] }), ERRP, hoje).join(" ")).toMatch(/decisão/);
    expect(validarNovaVersao(entrada({ chave: TRAVA, valor: 60, fontes: [] }), ERRP, hoje).join(" ")).toMatch(/FONTES/);
    expect(validarNovaVersao(entrada({ escopo: "com br" }), ERRP, hoje).join(" ")).toMatch(/Escopo/);
  });

  it("aponta política já gravada que uma regra externa agendada passa a contrariar", () => {
    const versoes = [
      ...ERRP,
      v({ chave: "produto.avisos.diasAntes", valor: [30, 7, 1], vigenteDesde: "2026-10-01" }),
      v({ chave: "icann.errp.aviso2JanelaDias", valor: { min: 2, max: 3 }, vigenteDesde: "2027-01-01" }),
    ];
    expect(conflitos(versoes, "2026-10-06")).toEqual([
      expect.objectContaining({ chave: "produto.avisos.diasAntes", escopo: "global", data: "2027-01-01" }),
    ]);
  });
});

describe("painel", () => {
  it("resume pendentes, sem valor e conflitos sem inventar valor", () => {
    const versoes = [
      ...ERRP,
      v({ chave: "produto.dns.versoesRetencaoDias", valor: 90, vigenteDesde: "2026-09-17", estado: "PENDENTE_DE_CONFIRMACAO" }),
    ];
    const painel = montarPainel(versoes, "2026-10-06");
    const retencao = painel.find((p) => p.definicao.chave === "produto.dns.versoesRetencaoDias")!;
    expect(retencao.hoje.tipo).toBe("pendente");
    expect(retencao.valorHoje).toBe("90");
    const semVersao = painel.find((p) => p.definicao.chave === TRAVA)!;
    expect(semVersao.hoje.tipo).toBe("ausente");
    expect(semVersao.valorHoje).toBeNull();
    const resumo = resumoDoPainel(painel);
    expect(resumo.pendentes).toBe(1);
    expect(resumo.semValor).toBe(CATALOGO.length - 4);
    expect(resumo.conflitos).toBe(0);
  });
});
