import { describe, expect, it } from "vitest";
import {
  alertasDaLoja,
  enderecoDaLoja,
  filtrarProdutos,
  juntarLojasComClientes,
  lerSituacao,
  paginar,
  resumirCatalogo,
  resumirLojas,
  rotuloDoPlano,
  type LojaNoPainel,
} from "@/lib/lojas-painel";
import type { LojaDaPlataforma, ProdutoDaLoja } from "@/lib/lojas-plataforma";

const AGORA = new Date("2026-09-19T12:00:00.000Z");
const ONTEM = "2026-09-18T12:00:00.000Z";
const MES_PASSADO = "2026-08-19T12:00:00.000Z";

function loja(parcial: Partial<LojaDaPlataforma> = {}): LojaDaPlataforma {
  return {
    slug: "brilhax",
    nome: "Brilhax",
    plano: "LOJA",
    status: "ATIVA",
    dominioPrincipal: null,
    criadoEm: MES_PASSADO,
    assinaturaId: "2c93",
    assinaturaStatus: "authorized",
    ultimoPagamentoEm: ONTEM,
    setupPagoEm: MES_PASSADO,
    suspensaEm: null,
    tentativasFalhas: 0,
    loginEmail: "dono@brilhax.com",
    emailContato: null,
    whatsapp: null,
    _count: { produtos: 40, pedidos: 12 },
    ...parcial,
  };
}

function noPainel(parcial: Partial<LojaDaPlataforma> = {}, cliente: LojaNoPainel["cliente"] = { id: "org1", nome: "Brilhax Automotiva" }): LojaNoPainel {
  return { ...loja(parcial), cliente };
}

function produto(parcial: Partial<ProdutoDaLoja> = {}): ProdutoDaLoja {
  return {
    id: "p1",
    slug: "retentor-xpto",
    nome: "Retentor XPTO",
    marca: "Sabó",
    sku: "SB-123",
    precoCentavos: 2490,
    precoDeCentavos: null,
    imagens: ["https://lojas.avilaops.com/uploads/brilhax/retentor.jpg"],
    imagemOrigem: "propria",
    destaque: false,
    ativo: true,
    disponibilidade: "in_stock",
    estoque: 5,
    atualizadoEm: ONTEM,
    criadoEm: MES_PASSADO,
    categoria: { nome: "Retentores", slug: "retentores" },
    ...parcial,
  };
}

describe("juntar a plataforma com as fichas do Ávila OS", () => {
  it("a lista mestra é a da plataforma: loja sem ficha aparece, com cliente nulo", () => {
    const lojas = juntarLojasComClientes(
      [loja({ slug: "brilhax" }), loja({ slug: "vedashow", nome: "Vedashow" })],
      [{ slug: "brilhax", cliente: { id: "org1", nome: "Brilhax Automotiva" } }],
    );
    expect(lojas).toHaveLength(2);
    expect(lojas[0].cliente?.nome).toBe("Brilhax Automotiva");
    // É o ponto do cruzamento: loja órfã só aparece porque a plataforma manda.
    expect(lojas[1].cliente).toBeNull();
  });

  it("vínculo que aponta para loja inexistente não inventa linha", () => {
    const lojas = juntarLojasComClientes(
      [loja({ slug: "brilhax" })],
      [{ slug: "loja-que-foi-apagada", cliente: { id: "org9", nome: "Fantasma" } }],
    );
    expect(lojas.map((l) => l.slug)).toEqual(["brilhax"]);
  });
});

describe("o que precisa de gente numa loja", () => {
  it("loja saudável e vinculada não gera alerta nenhum", () => {
    expect(alertasDaLoja(noPainel(), AGORA)).toEqual([]);
  });

  it("no ar sem nenhum produto é erro: quem entrar vê vitrine vazia", () => {
    const alertas = alertasDaLoja(noPainel({ _count: { produtos: 0, pedidos: 0 } }), AGORA);
    expect(alertas.some((a) => a.gravidade === "erro" && a.titulo === "No ar sem catálogo")).toBe(true);
  });

  it("loja suspensa é erro, porque o lojista não vende hoje", () => {
    const alertas = alertasDaLoja(noPainel({ status: "SUSPENSA", suspensaEm: ONTEM }), AGORA);
    expect(alertas[0]).toMatchObject({ gravidade: "erro", titulo: "Loja suspensa" });
  });

  it("recém-criada ainda configurando é fluxo normal, não pendência", () => {
    const alertas = alertasDaLoja(
      noPainel({ status: "PROVISIONANDO", criadoEm: "2026-09-19T11:00:00.000Z", _count: { produtos: 0, pedidos: 0 } }),
      AGORA,
    );
    expect(alertas).toEqual([]);
  });

  it("mais de um dia configurando é passo que falhou", () => {
    const alertas = alertasDaLoja(
      noPainel({ status: "PROVISIONANDO", criadoEm: MES_PASSADO, _count: { produtos: 0, pedidos: 0 } }),
      AGORA,
    );
    expect(alertas.some((a) => a.titulo === "Provisionamento parado")).toBe(true);
    // Provisionando não é "no ar": não pode acusar vitrine vazia junto.
    expect(alertas.some((a) => a.titulo === "No ar sem catálogo")).toBe(false);
  });

  it("assinatura criada há uma semana e nunca autorizada é cobrança a fazer", () => {
    const alertas = alertasDaLoja(noPainel({ assinaturaStatus: "pending", criadoEm: MES_PASSADO }), AGORA);
    expect(alertas.some((a) => a.titulo === "Assinatura nunca autorizada")).toBe(true);
  });

  it("assinatura pendente de loja criada ontem ainda não cobra nada", () => {
    const alertas = alertasDaLoja(noPainel({ assinaturaStatus: "pending", criadoEm: ONTEM }), AGORA);
    expect(alertas.some((a) => a.titulo === "Assinatura nunca autorizada")).toBe(false);
  });

  it("loja sem cliente vinculado é atenção, não erro: a loja funciona", () => {
    const alertas = alertasDaLoja(noPainel({}, null), AGORA);
    expect(alertas).toEqual([
      expect.objectContaining({ gravidade: "atencao", titulo: "Sem cliente vinculado" }),
    ]);
  });

  it("todo alerta diz o que fazer, não só o que está errado", () => {
    const alertas = alertasDaLoja(
      noPainel({ status: "SUSPENSA", tentativasFalhas: 3, assinaturaStatus: "pending" }, null),
      AGORA,
    );
    expect(alertas.length).toBeGreaterThan(1);
    for (const alerta of alertas) expect(alerta.detalhe.trim().length).toBeGreaterThan(20);
  });
});

describe("resumo da área", () => {
  it("conta cada estado uma vez e soma o que a plataforma já contou", () => {
    const resumo = resumirLojas(
      [
        noPainel({ slug: "a", _count: { produtos: 10, pedidos: 3 } }),
        noPainel({ slug: "b", status: "SUSPENSA", _count: { produtos: 5, pedidos: 1 } }),
        noPainel({ slug: "c", status: "PROVISIONANDO", criadoEm: "2026-09-19T11:00:00.000Z", _count: { produtos: 0, pedidos: 0 } }, null),
      ],
      AGORA,
    );
    expect(resumo).toMatchObject({
      total: 3,
      noAr: 1,
      suspensas: 1,
      configurando: 1,
      produtos: 15,
      pedidos: 4,
      semCliente: 1,
      comProblema: 1,
    });
  });
});

describe("plano contratado", () => {
  it("sai no vocabulário da tabela de preços, não no do banco", () => {
    expect(rotuloDoPlano("LOJA_PRO")).toBe("Loja Pro");
    expect(rotuloDoPlano("SITE")).toBe("Site");
  });

  it("plano que a plataforma criar e este app ainda não conhecer sai cru, sem inventar nome", () => {
    expect(rotuloDoPlano("MARKETPLACE")).toBe("MARKETPLACE");
  });
});

describe("endereço público", () => {
  it("usa o domínio próprio quando existe", () => {
    expect(enderecoDaLoja({ slug: "brilhax", dominioPrincipal: "brilhax.com" })).toBe("https://brilhax.com");
  });

  it("cai no subdomínio da plataforma enquanto o domínio não aponta", () => {
    expect(enderecoDaLoja({ slug: "brilhax", dominioPrincipal: null })).toBe(
      "https://brilhax.lojas.avilaops.com",
    );
  });
});

describe("saúde do catálogo", () => {
  it("só produto no ar conta como defeito — rascunho é trabalho em andamento", () => {
    const resumo = resumirCatalogo([
      produto({ id: "1" }),
      produto({ id: "2", ativo: false, imagens: [], precoCentavos: 0 }),
    ]);
    expect(resumo).toMatchObject({ total: 2, ativos: 1, inativos: 1, semFoto: 0, semPreco: 0 });
  });

  it("acusa o que o comprador vê e o lojista não", () => {
    const resumo = resumirCatalogo([
      produto({ id: "1", imagens: [] }),
      produto({ id: "2", precoCentavos: 0 }),
      produto({ id: "3", disponibilidade: "in_stock", estoque: 0 }),
      produto({ id: "4", imagemOrigem: "representativa" }),
      produto({ id: "5", imagemOrigem: "ilustracao" }),
    ]);
    expect(resumo.semFoto).toBe(1);
    expect(resumo.semPreco).toBe(1);
    expect(resumo.prometendoEstoqueQueNaoTem).toBe(1);
    expect(resumo.fotoNaoEDoItem).toBe(2);
  });

  it("produto sem controle de estoque não é acusado de prometer o que não tem", () => {
    // `estoque: null` na plataforma significa "não controla", e não "zero".
    const resumo = resumirCatalogo([produto({ estoque: null, disponibilidade: "in_stock" })]);
    expect(resumo.prometendoEstoqueQueNaoTem).toBe(0);
  });

  it("fora de estoque declarado é honesto, não defeito", () => {
    const resumo = resumirCatalogo([produto({ disponibilidade: "out_of_stock", estoque: 0 })]);
    expect(resumo.prometendoEstoqueQueNaoTem).toBe(0);
  });
});

describe("filtro do catálogo", () => {
  const catalogo = [
    produto({ id: "1", nome: "Retentor XPTO", sku: "SB-123", marca: "Sabó" }),
    produto({ id: "2", nome: "Rolamento ABC", sku: "NSK-9", marca: "NSK", imagens: [] }),
    produto({ id: "3", nome: "Junta do cabeçote", sku: null, marca: null, ativo: false }),
  ];

  it("busca por nome, SKU ou marca — o que a pessoa tem na mão", () => {
    expect(filtrarProdutos(catalogo, { busca: "rolamento" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrarProdutos(catalogo, { busca: "nsk-9" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrarProdutos(catalogo, { busca: "sabó" }).map((p) => p.id)).toEqual(["1"]);
  });

  it("produto sem SKU nem marca não quebra a busca", () => {
    expect(filtrarProdutos(catalogo, { busca: "junta" }).map((p) => p.id)).toEqual(["3"]);
  });

  it("filtro e busca se somam, não se substituem", () => {
    expect(filtrarProdutos(catalogo, { busca: "o", situacao: "sem-foto" }).map((p) => p.id)).toEqual(["2"]);
  });

  it("situação desconhecida na URL cai em todos, sem lista vazia enganosa", () => {
    expect(lerSituacao("chute")).toBe("todos");
    expect(lerSituacao(undefined)).toBe("todos");
    expect(lerSituacao("sem-foto")).toBe("sem-foto");
  });
});

describe("paginação", () => {
  const itens = Array.from({ length: 120 }, (_, i) => i);

  it("página fora do intervalo volta para a mais próxima em vez de mostrar vazio", () => {
    expect(paginar(itens, 999, 50).pagina).toBe(3);
    expect(paginar(itens, 0, 50).pagina).toBe(1);
    expect(paginar(itens, Number.NaN, 50).pagina).toBe(1);
  });

  it("a última página traz o resto", () => {
    expect(paginar(itens, 3, 50).itens).toHaveLength(20);
  });

  it("lista vazia tem uma página, não zero", () => {
    expect(paginar([], 1, 50)).toMatchObject({ pagina: 1, paginas: 1, total: 0 });
  });
});
