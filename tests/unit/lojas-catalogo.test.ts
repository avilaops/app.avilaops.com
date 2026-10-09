import { describe, expect, it } from "vitest";
import {
  CONSULTA_PADRAO,
  agruparPagina,
  consultaDoIndicador,
  enderecoDaConsulta,
  filtrosAtivos,
  indicadorSelecionado,
  lerConsulta,
  pendenciaDoProduto,
  queryDaPlataforma,
  reaisParaCentavos,
  type Consulta,
  type ProdutoResumido,
} from "@/lib/lojas-catalogo";
import { autorDaAlteracao, descreverAutor, rotuloDoCampo, valorDoCampo } from "@/lib/lojas-historico";

/**
 * O que é do painel no catálogo de uma loja: a consulta no endereço, a
 * tradução para a consulta da plataforma e os rótulos. Filtrar, ordenar,
 * paginar e contar é da plataforma, e é lá que isso é testado contra o banco
 * (`tests/integration/admin-catalogo.test.ts` do lojas.avilaops.com).
 */

let n = 0;
function produto(parcial: Partial<ProdutoResumido> = {}): ProdutoResumido {
  n += 1;
  return {
    id: `p${n}`,
    slug: `produto-${n}`,
    nome: `Produto ${n}`,
    marca: "Vonixx",
    sku: `SKU-${n}`,
    precoCentavos: 4990,
    precoDeCentavos: null,
    imagem: "https://loja.exemplo/foto.webp",
    fotos: 1,
    imagemOrigem: "propria",
    destaque: false,
    ativo: true,
    disponibilidade: "in_stock",
    estoque: null,
    estoqueEstado: "nao-controla",
    variacoes: 0,
    versaoCatalogo: 1,
    atualizadoEm: "2026-10-01T12:00:00.000Z",
    criadoEm: "2026-09-01T12:00:00.000Z",
    categoria: { nome: "Lavagem", slug: "lavagem" },
    ...parcial,
  };
}
const consulta = (parcial: Partial<Consulta> = {}): Consulta => ({ ...CONSULTA_PADRAO, ...parcial });

describe("consulta no endereço", () => {
  it("lê o que conhece e ignora o que não conhece, sem virar filtro fantasma", () => {
    const lida = lerConsulta({
      q: "  cera  ", categoria: "protecao", marca: "Vonixx", situacao: "banana",
      pend: ["sem-foto", "inventada"], estoque: "zerado", min: "10", max: "49,90",
      ordem: "preco-desc", grupo: "marca", por: "50", pagina: "3",
    });
    expect(lida).toEqual({
      q: "cera", categoria: "protecao", marca: "Vonixx", situacao: "",
      pendencias: ["sem-foto"], estoque: "zerado", precoMin: 1000, precoMax: 4990,
      ordem: "preco-desc", grupo: "marca", por: 50, pagina: 3,
    });
  });

  it("o padrão é 25 por página, nome A–Z, página 1", () => {
    expect(lerConsulta({})).toEqual(CONSULTA_PADRAO);
    expect(lerConsulta({ por: "37", pagina: "-2", ordem: "aleatoria" })).toMatchObject({ por: 25, pagina: 1, ordem: "nome-az" });
  });

  it("o endereço só carrega o que difere do padrão, e ida e volta dão a mesma consulta", () => {
    expect(enderecoDaConsulta("/lojas/brilhax", CONSULTA_PADRAO)).toBe("/lojas/brilhax");
    const c = consulta({ q: "cera", marca: "Vonixx", situacao: "ativos", pendencias: ["sem-foto"], ordem: "preco-asc", por: 50, pagina: 2, precoMax: 4990 });
    const endereco = enderecoDaConsulta("/lojas/brilhax", c);
    const volta = lerConsulta(Object.fromEntries(new URLSearchParams(endereco.split("?")[1])));
    expect(volta).toEqual(c);
  });

  it("mudar filtro, ordem ou tamanho volta para a página 1; mudar só a página preserva o resto", () => {
    const c = consulta({ marca: "Vonixx", pagina: 4 });
    expect(enderecoDaConsulta("/l", c, { situacao: "ativos" })).not.toContain("pagina=");
    expect(enderecoDaConsulta("/l", c, { ordem: "preco-asc" })).not.toContain("pagina=");
    expect(enderecoDaConsulta("/l", c, { pagina: 5 })).toBe("/l?marca=Vonixx&pagina=5");
  });

  it("texto que não é número não vira preço zero", () => {
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos("1.234,50")).toBe(123450);
    expect(reaisParaCentavos("R$ 49.90")).toBe(4990);
    expect(lerConsulta({ min: "abc" }).precoMin).toBeNull();
  });
});

describe("a consulta que vai para a plataforma", () => {
  it("leva tudo o que o endereço pediu, com preço em centavos e a ordem sempre explícita", () => {
    const c = consulta({ q: "cera vonixx", categoria: "protecao", marca: "Vonixx", situacao: "ativos", pendencias: ["sem-foto", "sob-consulta"], estoque: "zerado", precoMin: 1000, precoMax: 4990, ordem: "preco-desc", grupo: "marca", por: 50, pagina: 3 });
    const q = new URLSearchParams(queryDaPlataforma(c));
    expect(Object.fromEntries(q)).toMatchObject({ q: "cera vonixx", categoria: "protecao", marca: "Vonixx", situacao: "ativos", estoque: "zerado", min: "1000", max: "4990", ordem: "preco-desc", grupo: "marca", por: "50", pagina: "3" });
    expect(q.getAll("pend")).toEqual(["sem-foto", "sob-consulta"]);
  });

  it("consulta padrão manda só ordem, tamanho e página — nenhum filtro vazio", () => {
    expect(queryDaPlataforma(CONSULTA_PADRAO)).toBe("ordem=nome-az&por=25&pagina=1");
  });

  it("o filtro de estoque distingue zerado, não controlado e sem saldo cadastrado", () => {
    for (const estoque of ["com-saldo", "zerado", "nao-controla", "desconhecido"] as const) {
      expect(lerConsulta({ estoque }).estoque).toBe(estoque);
    }
    expect(lerConsulta({ estoque: "infinito" }).estoque).toBe("");
  });
});

describe("grupos na página", () => {
  const itens = [
    produto({ nome: "Ativado", categoria: { nome: "Lavagem", slug: "lavagem" } }),
    produto({ nome: "Shampoo", categoria: { nome: "Lavagem", slug: "lavagem" } }),
    produto({ nome: "Cera", categoria: { nome: "Proteção", slug: "protecao" } }),
    produto({ nome: "Avulso", categoria: null }),
  ];

  it("parte a página na ordem em que veio, com o total que a plataforma contou para o grupo inteiro", () => {
    const grupos = agruparPagina(
      { itens, total: 34, grupos: [{ chave: "Lavagem", total: 30 }, { chave: "Proteção", total: 3 }, { chave: "Sem categoria", total: 1 }] },
      "categoria",
    );
    expect(grupos.map((g) => [g.chave, g.total, g.itens.length])).toEqual([["Lavagem", 30, 2], ["Proteção", 3, 1], ["Sem categoria", 1, 1]]);
  });

  it("sem agrupar é um grupo só, sem nome, com o total do resultado", () => {
    expect(agruparPagina({ itens, total: 4, grupos: [] }, "")).toEqual([{ chave: "", total: 4, itens }]);
  });

  it("por marca e por situação usam os mesmos nomes de grupo da plataforma", () => {
    const lista = [produto({ marca: null, ativo: false }), produto({ marca: "Nitro" })];
    expect(agruparPagina({ itens: lista, total: 2, grupos: [] }, "marca").map((g) => g.chave)).toEqual(["Sem marca", "Nitro"]);
    expect(agruparPagina({ itens: lista, total: 2, grupos: [] }, "situacao").map((g) => g.chave)).toEqual(["Inativos", "Ativos"]);
  });
});

describe("indicadores como atalho", () => {
  it("o indicador abre 'ativos + a pendência dele' e só então aparece selecionado", () => {
    const aberta = consulta(consultaDoIndicador("sem-foto"));
    expect(aberta).toMatchObject({ situacao: "ativos", pendencias: ["sem-foto"] });
    expect(indicadorSelecionado(aberta, "sem-foto")).toBe(true);
    expect(indicadorSelecionado(aberta, "sob-consulta")).toBe(false);
  });

  it("deixa de estar selecionado quando outro filtro entra", () => {
    const c = consulta({ ...consultaDoIndicador("sem-foto"), marca: "Vonixx" });
    expect(indicadorSelecionado(c, "sem-foto")).toBe(false);
    expect(filtrosAtivos(c)).toBe(3);
  });
});

describe("a frase da linha", () => {
  it("grave para o que o comprador vê quebrado; nada para produto inativo", () => {
    expect(pendenciaDoProduto(produto({ fotos: 0, imagem: null }))).toEqual({ texto: "sem foto", grave: true });
    expect(pendenciaDoProduto(produto({ fotos: 0, imagem: null, ativo: false }))).toBeNull();
    expect(pendenciaDoProduto(produto({ precoCentavos: 0 }))).toEqual({ texto: "sob consulta", grave: false });
    expect(pendenciaDoProduto(produto({ imagemOrigem: "ilustracao" }))).toEqual({ texto: "ilustração, não foto", grave: false });
    expect(pendenciaDoProduto(produto())).toBeNull();
  });

  it("'anuncia estoque que não tem' só com contagem de verdade zerada", () => {
    const base = { disponibilidade: "in_stock" } as const;
    expect(pendenciaDoProduto(produto({ ...base, estoqueEstado: "controlado", estoque: 0 }))?.texto).toBe("anuncia estoque que não tem");
    // Não controla estoque, ou ninguém cadastrou saldo: não é zerado.
    expect(pendenciaDoProduto(produto({ ...base, estoqueEstado: "nao-controla", estoque: null }))).toBeNull();
    expect(pendenciaDoProduto(produto({ ...base, estoqueEstado: "desconhecido", estoque: null }))).toBeNull();
    // Esgotado declarado: a vitrine já diz que acabou.
    expect(pendenciaDoProduto(produto({ disponibilidade: "out_of_stock", estoqueEstado: "controlado", estoque: 0 }))).toBeNull();
  });
});

describe("quem alterou o produto", () => {
  it("pessoa aparece com nome e caminho", () => {
    expect(autorDaAlteracao("avilaops:Nicolas Avila")).toEqual({ tipo: "pessoa", caminho: "Painel da Ávila Ops", autor: "Nicolas Avila" });
    expect(descreverAutor("painel:maria@loja.com.br")).toBe("Painel da loja · maria@loja.com.br");
    expect(descreverAutor("painel:dono")).toBe("Painel da loja · login principal da loja");
  });

  it("registro antigo do painel não ganha autor inventado", () => {
    expect(autorDaAlteracao("painel")).toEqual({ tipo: "pessoa", caminho: "Painel da loja", autor: null });
    expect(descreverAutor("painel")).toBe("Painel da loja · autor não registrado");
  });

  it("alteração automática diz a integração ou a execução, nunca uma pessoa", () => {
    expect(descreverAutor("importacao")).toBe("Importação em lote · automática");
    expect(descreverAutor("api:erp-da-loja")).toBe("API, chave erp-da-loja · automática");
    expect(descreverAutor("migracao:catalogo-v1")).toBe("Migração catalogo-v1 · automática");
    expect(descreverAutor("revisao-catalogo-vedashow-20260928")).toBe("Execução revisao-catalogo-vedashow-20260928 · automática");
    for (const origem of ["importacao", "api:x", "migracao:y", "auditoria-2026-09-28"]) expect(autorDaAlteracao(origem).autor).toBeNull();
  });

  it("campo e valor do histórico saem legíveis, sem adivinhar o que não conhece", () => {
    expect(rotuloDoCampo("precoCentavos")).toBe("Preço");
    expect(rotuloDoCampo("campoQueNaoExiste")).toBe("campoQueNaoExiste");
    expect(valorDoCampo("precoCentavos", 4200).replace(/\s/g, " ")).toBe("R$ 42,00");
    expect(valorDoCampo("precoCentavos", 0)).toBe("sob consulta");
    expect(valorDoCampo("precoDeCentavos", null)).toBe("vazio");
    expect(valorDoCampo("ativo", false)).toBe("inativo");
    expect(valorDoCampo("imagens", ["a", "b"])).toBe("2 itens");
    expect(valorDoCampo("nome", "x".repeat(80))).toHaveLength(58);
  });
});
