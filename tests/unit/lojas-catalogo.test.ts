import { describe, expect, it } from "vitest";
import {
  CONSULTA_PADRAO,
  SEM_CATEGORIA,
  SEM_MARCA,
  agruparPagina,
  consultaDoIndicador,
  enderecoDaConsulta,
  facetas,
  filtrarCatalogo,
  filtrosAtivos,
  indicadorSelecionado,
  lerConsulta,
  ordenarCatalogo,
  paginarCatalogo,
  pendenciaDoProduto,
  reaisParaCentavos,
  resumirCatalogo,
  type Consulta,
  type Pendencia,
  type ProdutoResumido,
} from "@/lib/lojas-catalogo";

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
    atualizadoEm: "2026-10-01T12:00:00.000Z",
    criadoEm: "2026-09-01T12:00:00.000Z",
    categoria: { nome: "Lavagem", slug: "lavagem" },
    ...parcial,
  };
}
const consulta = (parcial: Partial<Consulta> = {}): Consulta => ({ ...CONSULTA_PADRAO, ...parcial });
const nomes = (lista: ProdutoResumido[]) => lista.map((p) => p.nome);

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

describe("busca", () => {
  const catalogo = [
    produto({ nome: "Cera Blend Cleaner Wax Vonixx 500 ml", sku: "7898511830037", marca: "Vonixx" }),
    produto({ nome: "Boina Arctic Wool 133 mm", sku: "WP-503", marca: "Wolf Pads" }),
    produto({ nome: "Aplicador de Espuma", sku: "00066", marca: null }),
  ];

  it("acha pelo SKU inteiro ou por um pedaço", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ q: "WP-503" })))).toEqual(["Boina Arctic Wool 133 mm"]);
    expect(nomes(filtrarCatalogo(catalogo, consulta({ q: "78985" })))).toEqual(["Cera Blend Cleaner Wax Vonixx 500 ml"]);
  });

  it("acha por nome e por marca, sem ligar para acento, caixa nem ordem das palavras", () => {
    expect(filtrarCatalogo(catalogo, consulta({ q: "WOLF" }))).toHaveLength(1);
    expect(filtrarCatalogo(catalogo, consulta({ q: "vonixx cera" }))).toHaveLength(1);
    expect(filtrarCatalogo(catalogo, consulta({ q: "aplicadór" }))).toHaveLength(1);
    expect(filtrarCatalogo(catalogo, consulta({ q: "cera wolf" }))).toHaveLength(0);
  });
});

describe("filtros combináveis", () => {
  const catalogo = [
    produto({ nome: "A", marca: "Vonixx", ativo: true, fotos: 0, imagem: null }),
    produto({ nome: "B", marca: "Vonixx", ativo: true }),
    produto({ nome: "C", marca: "Vonixx", ativo: false, fotos: 0, imagem: null }),
    produto({ nome: "D", marca: "Nitro", ativo: true, fotos: 0, imagem: null, categoria: { nome: "Proteção", slug: "protecao" } }),
    produto({ nome: "E", marca: null, categoria: null, precoCentavos: 0 }),
  ];

  it("Marca Vonixx + Ativos + Sem foto dá exatamente o produto que cumpre os três", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ marca: "Vonixx", situacao: "ativos", pendencias: ["sem-foto"] })))).toEqual(["A"]);
  });

  it("categoria + marca + situação", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ categoria: "lavagem", marca: "Vonixx", situacao: "inativos" })))).toEqual(["C"]);
    expect(nomes(filtrarCatalogo(catalogo, consulta({ categoria: "protecao", marca: "Vonixx" })))).toEqual([]);
  });

  it("sem categoria e sem marca são filtros, não nomes", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ categoria: SEM_CATEGORIA })))).toEqual(["E"]);
    expect(nomes(filtrarCatalogo(catalogo, consulta({ marca: SEM_MARCA })))).toEqual(["E"]);
  });

  it("duas pendências juntas exigem as duas", () => {
    const semFotoESemPreco = produto({ nome: "F", fotos: 0, imagem: null, precoCentavos: 0 });
    expect(nomes(filtrarCatalogo([...catalogo, semFotoESemPreco], consulta({ pendencias: ["sem-foto", "sob-consulta"] })))).toEqual(["F"]);
  });
});

describe("preço e estoque não confundem ausência com zero", () => {
  const catalogo = [
    produto({ nome: "Barato", precoCentavos: 1000 }),
    produto({ nome: "Caro", precoCentavos: 30000 }),
    produto({ nome: "Sob consulta", precoCentavos: 0 }),
    produto({ nome: "Com saldo", estoque: 5 }),
    produto({ nome: "Zerado", estoque: 0 }),
    produto({ nome: "Vendido além do saldo", estoque: -2 }),
  ];

  it("faixa de preço deixa de fora quem é sob consulta, mesmo com mínimo zero", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ precoMin: 0, precoMax: 2000 })))).not.toContain("Sob consulta");
    expect(nomes(filtrarCatalogo(catalogo, consulta({ precoMin: 20000 })))).toEqual(["Caro"]);
  });

  it("estoque zerado é contagem ≤ 0; quem não controla estoque não é zerado", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ estoque: "zerado" })))).toEqual(["Zerado", "Vendido além do saldo"]);
    expect(nomes(filtrarCatalogo(catalogo, consulta({ estoque: "com-saldo" })))).toEqual(["Com saldo"]);
    expect(filtrarCatalogo(catalogo, consulta({ estoque: "nao-controla" }))).toHaveLength(3);
  });
});

describe("ordenação do catálogo inteiro", () => {
  it("nome A–Z em português: acento não manda para o fim e número conta como número", () => {
    const lista = [produto({ nome: "Óleo" }), produto({ nome: "Item 10" }), produto({ nome: "água" }), produto({ nome: "Item 2" }), produto({ nome: "Zinco" })];
    expect(nomes(ordenarCatalogo(lista, "nome-az"))).toEqual(["água", "Item 2", "Item 10", "Óleo", "Zinco"]);
    expect(nomes(ordenarCatalogo(lista, "nome-za"))[0]).toBe("Zinco");
  });

  it("preço crescente e decrescente; sob consulta fica no fim nas duas direções", () => {
    const lista = [produto({ nome: "Sob consulta", precoCentavos: 0 }), produto({ nome: "Caro", precoCentavos: 9000 }), produto({ nome: "Barato", precoCentavos: 1000 })];
    expect(nomes(ordenarCatalogo(lista, "preco-asc"))).toEqual(["Barato", "Caro", "Sob consulta"]);
    expect(nomes(ordenarCatalogo(lista, "preco-desc"))).toEqual(["Caro", "Barato", "Sob consulta"]);
  });

  it("marca, categoria, estoque e atualização", () => {
    const lista = [
      produto({ nome: "c", marca: "Wolf", categoria: { nome: "Polimento", slug: "p" }, estoque: 3, atualizadoEm: "2026-10-03T00:00:00Z" }),
      produto({ nome: "a", marca: null, categoria: null, estoque: null, atualizadoEm: "2026-10-01T00:00:00Z" }),
      produto({ nome: "b", marca: "Nitro", categoria: { nome: "Lavagem", slug: "l" }, estoque: 0, atualizadoEm: "2026-10-05T00:00:00Z" }),
    ];
    expect(nomes(ordenarCatalogo(lista, "marca"))).toEqual(["b", "c", "a"]);
    expect(nomes(ordenarCatalogo(lista, "categoria"))).toEqual(["b", "c", "a"]);
    expect(nomes(ordenarCatalogo(lista, "estoque-asc"))).toEqual(["b", "c", "a"]);
    expect(nomes(ordenarCatalogo(lista, "estoque-desc"))).toEqual(["c", "b", "a"]);
    expect(nomes(ordenarCatalogo(lista, "atualizado"))).toEqual(["b", "c", "a"]);
  });

  it("não altera a lista recebida", () => {
    const lista = [produto({ nome: "b" }), produto({ nome: "a" })];
    ordenarCatalogo(lista, "nome-az");
    expect(nomes(lista)).toEqual(["b", "a"]);
  });
});

describe("agrupamento", () => {
  const catalogo = [
    produto({ nome: "Cera", categoria: { nome: "Proteção", slug: "protecao" } }),
    produto({ nome: "Shampoo", categoria: { nome: "Lavagem", slug: "lavagem" } }),
    produto({ nome: "Avulso", categoria: null }),
    produto({ nome: "Desengraxante", categoria: { nome: "Lavagem", slug: "lavagem" } }),
    produto({ nome: "Ativado", categoria: { nome: "Lavagem", slug: "lavagem" } }),
  ];

  it("agrupar por categoria põe os grupos em ordem, com a ordem escolhida dentro, e 'Sem categoria' no fim", () => {
    const ordenado = ordenarCatalogo(catalogo, "nome-az", "categoria");
    expect(nomes(ordenado)).toEqual(["Ativado", "Desengraxante", "Shampoo", "Cera", "Avulso"]);
  });

  it("o total do grupo é o do resultado inteiro, mesmo quando a página corta o grupo", () => {
    const ordenado = ordenarCatalogo(catalogo, "nome-az", "categoria");
    const pagina1 = paginarCatalogo(ordenado, 1, 2);
    const pagina2 = paginarCatalogo(ordenado, 2, 2);
    expect(agruparPagina(ordenado, pagina1.itens, "categoria")).toEqual([
      expect.objectContaining({ chave: "Lavagem", total: 3, itens: expect.arrayContaining([expect.objectContaining({ nome: "Ativado" })]) }),
    ]);
    expect(agruparPagina(ordenado, pagina2.itens, "categoria").map((g) => [g.chave, g.total, g.itens.length])).toEqual([
      ["Lavagem", 3, 1],
      ["Proteção", 1, 1],
    ]);
  });

  it("por marca e por situação", () => {
    const lista = [produto({ nome: "x", marca: null, ativo: false }), produto({ nome: "y", marca: "Nitro" })];
    expect(agruparPagina(lista, ordenarCatalogo(lista, "nome-az", "marca"), "marca").map((g) => g.chave)).toEqual(["Nitro", "Sem marca"]);
    expect(agruparPagina(lista, ordenarCatalogo(lista, "nome-az", "situacao"), "situacao").map((g) => g.chave)).toEqual(["Ativos", "Inativos"]);
  });

  it("sem agrupar devolve um grupo só, sem nome", () => {
    expect(agruparPagina(catalogo, catalogo.slice(0, 2), "")).toEqual([{ chave: "", total: 5, itens: catalogo.slice(0, 2) }]);
  });
});

describe("paginação", () => {
  const itens = Array.from({ length: 224 }, (_, i) => i + 1);

  it("diz o intervalo e o total, e a última página pode ser menor", () => {
    expect(paginarCatalogo(itens, 1, 25)).toMatchObject({ de: 1, ate: 25, total: 224, paginas: 9, pagina: 1 });
    expect(paginarCatalogo(itens, 9, 25)).toMatchObject({ de: 201, ate: 224, pagina: 9 });
    expect(paginarCatalogo(itens, 3, 100)).toMatchObject({ de: 201, ate: 224, paginas: 3 });
  });

  it("página além do fim cai na última; lista vazia é 0–0 em uma página", () => {
    expect(paginarCatalogo(itens, 99, 50).pagina).toBe(5);
    expect(paginarCatalogo([], 3, 25)).toMatchObject({ itens: [], pagina: 1, paginas: 1, total: 0, de: 0, ate: 0 });
  });
});

describe("indicadores e a lista que eles abrem", () => {
  const catalogo = [
    produto({ nome: "Sem foto no ar", fotos: 0, imagem: null }),
    produto({ nome: "Sem foto, inativo", fotos: 0, imagem: null, ativo: false }),
    produto({ nome: "Sob consulta", precoCentavos: 0 }),
    produto({ nome: "Diz que tem e não tem", estoque: 0, disponibilidade: "in_stock" }),
    produto({ nome: "Esgotado declarado", estoque: 0, disponibilidade: "out_of_stock" }),
    produto({ nome: "Foto da família", imagemOrigem: "representativa" }),
    produto({ nome: "Ilustração", imagemOrigem: "ilustracao" }),
    produto({ nome: "Certinho", estoque: 4 }),
  ];
  const resumo = resumirCatalogo(catalogo);

  it("conta só produto ativo, e separa 'não controla' de zerado", () => {
    expect(resumo).toEqual({
      total: 8, ativos: 7, inativos: 1,
      semFoto: 1, sobConsulta: 1, anunciaSemSaldo: 1, fotoDeOutroItem: 2,
      controlamEstoque: 3,
    });
  });

  it.each([
    ["sem-foto", "semFoto"],
    ["sob-consulta", "sobConsulta"],
    ["anuncia-sem-saldo", "anunciaSemSaldo"],
    ["foto-de-outro", "fotoDeOutroItem"],
  ] as const)("clicar em %s lista exatamente o que o indicador contou", (pendencia, campo) => {
    const aberta = consulta(consultaDoIndicador(pendencia as Pendencia));
    expect(filtrarCatalogo(catalogo, aberta)).toHaveLength(resumo[campo]);
    expect(indicadorSelecionado(aberta, pendencia as Pendencia)).toBe(true);
  });

  it("o indicador deixa de estar selecionado quando outro filtro entra", () => {
    const c = consulta({ ...consultaDoIndicador("sem-foto"), marca: "Vonixx" });
    expect(indicadorSelecionado(c, "sem-foto")).toBe(false);
    expect(filtrosAtivos(c)).toBe(3);
  });

  it("esgotado declarado não é 'anuncia sem saldo': a vitrine já diz que acabou", () => {
    expect(nomes(filtrarCatalogo(catalogo, consulta({ pendencias: ["anuncia-sem-saldo"] })))).toEqual(["Diz que tem e não tem"]);
  });

  it("a frase da linha: grave para o que o comprador vê quebrado, e nada para inativo", () => {
    expect(pendenciaDoProduto(catalogo[0])).toEqual({ texto: "sem foto", grave: true });
    expect(pendenciaDoProduto(catalogo[1])).toBeNull();
    expect(pendenciaDoProduto(catalogo[2])).toEqual({ texto: "sob consulta", grave: false });
    expect(pendenciaDoProduto(catalogo[7])).toBeNull();
  });
});

describe("facetas", () => {
  it("lista categorias e marcas que existem, com a contagem, e 'sem' por último", () => {
    const { categorias, marcas } = facetas([
      produto({ marca: "Wolf Pads", categoria: { nome: "Polimento", slug: "polimento" } }),
      produto({ marca: null, categoria: null }),
      produto({ marca: "Nitro", categoria: { nome: "Lavagem", slug: "lavagem" } }),
      produto({ marca: "Nitro", categoria: { nome: "Lavagem", slug: "lavagem" } }),
    ]);
    expect(categorias.map((c) => [c.rotulo, c.total])).toEqual([["Lavagem", 2], ["Polimento", 1], ["Sem categoria", 1]]);
    expect(marcas.map((m) => [m.valor, m.total])).toEqual([["Nitro", 2], ["Wolf Pads", 1], [SEM_MARCA, 1]]);
  });
});
