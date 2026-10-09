/**
 * As regras do catálogo de uma loja, vistas pelo painel da Ávila Ops.
 *
 * Tudo aqui é função pura sobre a lista enxuta que a plataforma devolve
 * (`…/produtos?resumo=1`): busca, filtros, ordenação, agrupamento, paginação e
 * os indicadores. Contagem e listagem saem do MESMO predicado — o número do
 * indicador e o total da lista filtrada não têm como discordar, porque não há
 * duas implementações da regra.
 *
 * A consulta inteira mora no endereço (`?q=…&marca=…&ordem=…`): link direto
 * funciona, o botão voltar devolve o mesmo contexto e nada depende de estado
 * guardado no navegador.
 *
 * As definições acompanham as da própria plataforma (`produto-regras.ts` de
 * lá), para o painel não chamar de defeito o que a vitrine trata como regra:
 * - preço zero é "sob consulta" — a loja mostra e negocia pelo WhatsApp. O
 *   modelo não tem preço nulo: ausência e zero são o mesmo valor gravado;
 * - estoque `null` é "não controla estoque", nunca "zerado";
 * - esgotado é marcado como `out_of_stock` OU com contagem ≤ 0.
 */

export interface ProdutoResumido {
  id: string;
  slug: string;
  nome: string;
  marca: string | null;
  sku: string | null;
  precoCentavos: number;
  precoDeCentavos: number | null;
  /** A capa. `null` com `fotos === 0` é produto sem foto. */
  imagem: string | null;
  fotos: number;
  /** `propria` | `representativa` | `ilustracao`, declarado por quem gravou a imagem. */
  imagemOrigem: string;
  destaque: boolean;
  ativo: boolean;
  disponibilidade: string;
  /** `null` = a loja não controla estoque deste item. */
  estoque: number | null;
  atualizadoEm: string;
  criadoEm: string;
  categoria: { nome: string; slug: string } | null;
}

/* ───────────────────────── predicados ───────────────────────── */

export const semFoto = (p: ProdutoResumido) => p.fotos === 0;
export const sobConsulta = (p: ProdutoResumido) => p.precoCentavos <= 0;
export const fotoDeOutroItem = (p: ProdutoResumido) => p.fotos > 0 && p.imagemOrigem !== "propria";
export const controlaEstoque = (p: ProdutoResumido) => p.estoque !== null;
export const estoqueZerado = (p: ProdutoResumido) => p.estoque !== null && p.estoque <= 0;
/** Diz "em estoque" na vitrine e a contagem está zerada: o comprador vê o defeito antes do lojista. */
export const anunciaSemSaldo = (p: ProdutoResumido) => p.disponibilidade === "in_stock" && estoqueZerado(p);

export type Pendencia = "sem-foto" | "sob-consulta" | "anuncia-sem-saldo" | "foto-de-outro";

export const PENDENCIAS: { valor: Pendencia; rotulo: string; teste: (p: ProdutoResumido) => boolean }[] = [
  { valor: "sem-foto", rotulo: "Sem foto", teste: semFoto },
  { valor: "sob-consulta", rotulo: "Sem preço (sob consulta)", teste: sobConsulta },
  { valor: "anuncia-sem-saldo", rotulo: "Anuncia estoque que não tem", teste: anunciaSemSaldo },
  { valor: "foto-de-outro", rotulo: "Foto de outro item", teste: fotoDeOutroItem },
];

export type FiltroDeEstoque = "" | "com-saldo" | "zerado" | "nao-controla";
export const ESTOQUES: { valor: Exclude<FiltroDeEstoque, "">; rotulo: string }[] = [
  { valor: "com-saldo", rotulo: "Com saldo" },
  { valor: "zerado", rotulo: "Zerado" },
  { valor: "nao-controla", rotulo: "Não controla estoque" },
];

export type FiltroDeSituacao = "" | "ativos" | "inativos";

export type Ordem =
  | "nome-az"
  | "nome-za"
  | "preco-asc"
  | "preco-desc"
  | "marca"
  | "categoria"
  | "estoque-asc"
  | "estoque-desc"
  | "atualizado";

export const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: "nome-az", rotulo: "Nome A–Z" },
  { valor: "nome-za", rotulo: "Nome Z–A" },
  { valor: "preco-asc", rotulo: "Preço: menor primeiro" },
  { valor: "preco-desc", rotulo: "Preço: maior primeiro" },
  { valor: "marca", rotulo: "Marca" },
  { valor: "categoria", rotulo: "Categoria" },
  { valor: "estoque-asc", rotulo: "Estoque: menor primeiro" },
  { valor: "estoque-desc", rotulo: "Estoque: maior primeiro" },
  { valor: "atualizado", rotulo: "Atualizados por último" },
];

export type Agrupamento = "" | "categoria" | "marca" | "situacao";
export const AGRUPAMENTOS: { valor: Exclude<Agrupamento, "">; rotulo: string }[] = [
  { valor: "categoria", rotulo: "Categoria" },
  { valor: "marca", rotulo: "Marca" },
  { valor: "situacao", rotulo: "Situação" },
];

export const TAMANHOS_DE_PAGINA = [25, 50, 100] as const;
export const TAMANHO_PADRAO = 25;

/** Valores reservados para "o produto não tem isto". Não colidem com slug nem com nome de marca. */
export const SEM_CATEGORIA = "~sem-categoria";
export const SEM_MARCA = "~sem-marca";

export type Consulta = {
  q: string;
  /** Slug da categoria, ou `SEM_CATEGORIA`. */
  categoria: string;
  /** Nome da marca como está gravado, ou `SEM_MARCA`. */
  marca: string;
  situacao: FiltroDeSituacao;
  pendencias: Pendencia[];
  estoque: FiltroDeEstoque;
  /** Em centavos. `null` = sem limite. */
  precoMin: number | null;
  precoMax: number | null;
  ordem: Ordem;
  grupo: Agrupamento;
  por: number;
  pagina: number;
};

export const CONSULTA_PADRAO: Consulta = {
  q: "",
  categoria: "",
  marca: "",
  situacao: "",
  pendencias: [],
  estoque: "",
  precoMin: null,
  precoMax: null,
  ordem: "nome-az",
  grupo: "",
  por: TAMANHO_PADRAO,
  pagina: 1,
};

type Bruto = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const varios = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const entre = <T extends string>(valor: string, opcoes: readonly T[], padrao: T): T =>
  (opcoes as readonly string[]).includes(valor) ? (valor as T) : padrao;

/** "49,90", "49.90" e "1.234,50" viram centavos. Texto que não é número vira `null`, não zero. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const valor = Number(normal);
  return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : null;
}

/** Lê a consulta do endereço. Valor desconhecido cai no padrão — nunca vira filtro fantasma. */
export function lerConsulta(bruto: Bruto): Consulta {
  const por = Number(um(bruto.por));
  const pagina = Math.trunc(Number(um(bruto.pagina)));
  return {
    q: um(bruto.q).trim().slice(0, 120),
    categoria: um(bruto.categoria).slice(0, 120),
    marca: um(bruto.marca).slice(0, 120),
    situacao: entre(um(bruto.situacao), ["ativos", "inativos"] as const, "" as FiltroDeSituacao),
    pendencias: PENDENCIAS.map((p) => p.valor).filter((v) => varios(bruto.pend).includes(v)),
    estoque: entre(um(bruto.estoque), ["com-saldo", "zerado", "nao-controla"] as const, "" as FiltroDeEstoque),
    precoMin: reaisParaCentavos(um(bruto.min)),
    precoMax: reaisParaCentavos(um(bruto.max)),
    ordem: entre(um(bruto.ordem), ORDENS.map((o) => o.valor), "nome-az"),
    grupo: entre(um(bruto.grupo), ["categoria", "marca", "situacao"] as const, "" as Agrupamento),
    por: (TAMANHOS_DE_PAGINA as readonly number[]).includes(por) ? por : TAMANHO_PADRAO,
    pagina: pagina > 0 ? pagina : 1,
  };
}

const centavosParaCampo = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/**
 * A consulta de volta ao endereço, só com o que difere do padrão.
 *
 * Mudar qualquer coisa que não seja a página volta para a página 1: o
 * resultado é outro, e "página 4" dele pode nem existir.
 */
export function enderecoDaConsulta(base: string, consulta: Consulta, mudanca: Partial<Consulta> = {}): string {
  const mudouOResultado = Object.keys(mudanca).some((chave) => chave !== "pagina");
  const c: Consulta = { ...consulta, ...mudanca, pagina: mudanca.pagina ?? (mudouOResultado ? 1 : consulta.pagina) };

  const query = new URLSearchParams();
  if (c.q) query.set("q", c.q);
  if (c.categoria) query.set("categoria", c.categoria);
  if (c.marca) query.set("marca", c.marca);
  if (c.situacao) query.set("situacao", c.situacao);
  for (const p of c.pendencias) query.append("pend", p);
  if (c.estoque) query.set("estoque", c.estoque);
  if (c.precoMin !== null) query.set("min", centavosParaCampo(c.precoMin));
  if (c.precoMax !== null) query.set("max", centavosParaCampo(c.precoMax));
  if (c.ordem !== "nome-az") query.set("ordem", c.ordem);
  if (c.grupo) query.set("grupo", c.grupo);
  if (c.por !== TAMANHO_PADRAO) query.set("por", String(c.por));
  if (c.pagina > 1) query.set("pagina", String(c.pagina));

  const sufixo = query.toString();
  return sufixo ? `${base}?${sufixo}` : base;
}

/** Quantos filtros estão ligados — a busca conta, a ordenação e o agrupamento não. */
export function filtrosAtivos(c: Consulta): number {
  return (
    (c.q ? 1 : 0) +
    (c.categoria ? 1 : 0) +
    (c.marca ? 1 : 0) +
    (c.situacao ? 1 : 0) +
    c.pendencias.length +
    (c.estoque ? 1 : 0) +
    (c.precoMin !== null || c.precoMax !== null ? 1 : 0)
  );
}

/* ───────────────────────── filtrar ───────────────────────── */

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarCatalogo(produtos: ProdutoResumido[], c: Consulta): ProdutoResumido[] {
  // Cada palavra da busca precisa aparecer em nome, SKU ou marca — em qualquer
  // ordem e sem ligar para acento: "cera vonix" acha "Cera … Vonixx".
  const termos = semAcento(c.q).split(/\s+/).filter(Boolean);
  const pendencias = PENDENCIAS.filter((p) => c.pendencias.includes(p.valor));

  return produtos.filter((p) => {
    if (termos.length) {
      const alvo = semAcento(`${p.nome} ${p.sku ?? ""} ${p.marca ?? ""}`);
      if (!termos.every((t) => alvo.includes(t))) return false;
    }
    if (c.categoria && (c.categoria === SEM_CATEGORIA ? p.categoria !== null : p.categoria?.slug !== c.categoria)) return false;
    if (c.marca && (c.marca === SEM_MARCA ? Boolean(p.marca) : p.marca !== c.marca)) return false;
    if (c.situacao === "ativos" && !p.ativo) return false;
    if (c.situacao === "inativos" && p.ativo) return false;
    if (!pendencias.every((pend) => pend.teste(p))) return false;
    if (c.estoque === "com-saldo" && !(p.estoque !== null && p.estoque > 0)) return false;
    if (c.estoque === "zerado" && !estoqueZerado(p)) return false;
    if (c.estoque === "nao-controla" && p.estoque !== null) return false;
    if (c.precoMin !== null || c.precoMax !== null) {
      // Faixa de preço é sobre quem TEM preço: "sob consulta" não é R$ 0,00.
      if (sobConsulta(p)) return false;
      if (c.precoMin !== null && p.precoCentavos < c.precoMin) return false;
      if (c.precoMax !== null && p.precoCentavos > c.precoMax) return false;
    }
    return true;
  });
}

/* ───────────────────────── ordenar e agrupar ───────────────────────── */

// Português do Brasil: "Água" junto de "Agua", "Item 2" antes de "Item 10".
const colador = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const porNome = (a: ProdutoResumido, b: ProdutoResumido) => colador.compare(a.nome, b.nome);
/** Valor ausente vai para o fim nas duas direções: quem ordena por preço quer ver preço. */
const numeroOuFim = (valor: number | null, crescente: boolean) =>
  valor === null ? Number.POSITIVE_INFINITY : crescente ? valor : -valor;
const textoOuFim = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return colador.compare(a, b);
};

function comparador(ordem: Ordem): (a: ProdutoResumido, b: ProdutoResumido) => number {
  const preco = (p: ProdutoResumido) => (sobConsulta(p) ? null : p.precoCentavos);
  switch (ordem) {
    case "nome-za":
      return (a, b) => porNome(b, a);
    case "preco-asc":
      return (a, b) => numeroOuFim(preco(a), true) - numeroOuFim(preco(b), true) || porNome(a, b);
    case "preco-desc":
      return (a, b) => numeroOuFim(preco(a), false) - numeroOuFim(preco(b), false) || porNome(a, b);
    case "marca":
      return (a, b) => textoOuFim(a.marca, b.marca) || porNome(a, b);
    case "categoria":
      return (a, b) => textoOuFim(a.categoria?.nome, b.categoria?.nome) || porNome(a, b);
    case "estoque-asc":
      return (a, b) => numeroOuFim(a.estoque, true) - numeroOuFim(b.estoque, true) || porNome(a, b);
    case "estoque-desc":
      return (a, b) => numeroOuFim(a.estoque, false) - numeroOuFim(b.estoque, false) || porNome(a, b);
    case "atualizado":
      return (a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm) || porNome(a, b);
    default:
      return porNome;
  }
}

export function chaveDoGrupo(p: ProdutoResumido, grupo: Agrupamento): string {
  if (grupo === "categoria") return p.categoria?.nome ?? "Sem categoria";
  if (grupo === "marca") return p.marca || "Sem marca";
  if (grupo === "situacao") return p.ativo ? "Ativos" : "Inativos";
  return "";
}

/** Ordena o catálogo inteiro; agrupando, o grupo é a primeira chave e a ordem escolhida vale dentro dele. */
export function ordenarCatalogo(produtos: ProdutoResumido[], ordem: Ordem, grupo: Agrupamento = ""): ProdutoResumido[] {
  const dentro = comparador(ordem);
  const copia = [...produtos];
  if (!grupo) return copia.sort(dentro);

  const semGrupo = (chave: string) => chave.startsWith("Sem ");
  return copia.sort((a, b) => {
    const [ga, gb] = [chaveDoGrupo(a, grupo), chaveDoGrupo(b, grupo)];
    if (ga !== gb) {
      // "Sem categoria" e "Sem marca" fecham a lista, não a abrem.
      if (semGrupo(ga) !== semGrupo(gb)) return semGrupo(ga) ? 1 : -1;
      return colador.compare(ga, gb);
    }
    return dentro(a, b);
  });
}

/* ───────────────────────── paginar ───────────────────────── */

export type Pagina<T> = {
  itens: T[];
  pagina: number;
  paginas: number;
  total: number;
  /** Posição do primeiro e do último item da página no resultado, contando de 1. Zero quando vazio. */
  de: number;
  ate: number;
};

export function paginarCatalogo<T>(itens: T[], pagina: number, por: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(itens.length / por));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const inicio = (atual - 1) * por;
  const fatia = itens.slice(inicio, inicio + por);
  return {
    itens: fatia,
    pagina: atual,
    paginas,
    total: itens.length,
    de: fatia.length ? inicio + 1 : 0,
    ate: inicio + fatia.length,
  };
}

export type GrupoNaPagina<T> = { chave: string; total: number; itens: T[] };

/**
 * Parte a página em grupos, com o total de cada grupo no resultado INTEIRO.
 *
 * Um grupo pode atravessar páginas; o número ao lado do nome é o do grupo, não
 * o das linhas que couberam nesta página — senão "Polimento (7)" viraria
 * "Polimento (3)" e "Polimento (4)" em duas páginas e ninguém saberia quantos são.
 */
export function agruparPagina(
  resultado: ProdutoResumido[],
  pagina: ProdutoResumido[],
  grupo: Agrupamento,
): GrupoNaPagina<ProdutoResumido>[] {
  if (!grupo) return [{ chave: "", total: resultado.length, itens: pagina }];

  const totais = new Map<string, number>();
  for (const p of resultado) {
    const chave = chaveDoGrupo(p, grupo);
    totais.set(chave, (totais.get(chave) ?? 0) + 1);
  }

  const grupos: GrupoNaPagina<ProdutoResumido>[] = [];
  for (const p of pagina) {
    const chave = chaveDoGrupo(p, grupo);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(p);
    else grupos.push({ chave, total: totais.get(chave) ?? 0, itens: [p] });
  }
  return grupos;
}

/* ───────────────────────── indicadores e facetas ───────────────────────── */

export type ResumoDoCatalogo = {
  total: number;
  ativos: number;
  inativos: number;
  /** Os quatro abaixo contam só produto ATIVO: rascunho incompleto é trabalho em andamento. */
  semFoto: number;
  sobConsulta: number;
  anunciaSemSaldo: number;
  fotoDeOutroItem: number;
  /** Quantos itens controlam estoque. Zero quer dizer que "estoque" não é informação desta loja. */
  controlamEstoque: number;
};

export function resumirCatalogo(produtos: ProdutoResumido[]): ResumoDoCatalogo {
  const ativos = produtos.filter((p) => p.ativo);
  return {
    total: produtos.length,
    ativos: ativos.length,
    inativos: produtos.length - ativos.length,
    semFoto: ativos.filter(semFoto).length,
    sobConsulta: ativos.filter(sobConsulta).length,
    anunciaSemSaldo: ativos.filter(anunciaSemSaldo).length,
    fotoDeOutroItem: ativos.filter(fotoDeOutroItem).length,
    controlamEstoque: produtos.filter(controlaEstoque).length,
  };
}

/** A consulta que um indicador abre: a mesma regra da contagem, por construção. */
export function consultaDoIndicador(pendencia: Pendencia): Partial<Consulta> {
  return { situacao: "ativos", pendencias: [pendencia], q: "", categoria: "", marca: "", estoque: "", precoMin: null, precoMax: null };
}

/** O indicador está selecionado quando a consulta é exatamente a que ele abre. */
export function indicadorSelecionado(c: Consulta, pendencia: Pendencia): boolean {
  return c.situacao === "ativos" && c.pendencias.length === 1 && c.pendencias[0] === pendencia && filtrosAtivos(c) === 2;
}

export type Faceta = { valor: string; rotulo: string; total: number };

/** Categorias e marcas que existem neste catálogo, com quantos produtos cada uma tem. */
export function facetas(produtos: ProdutoResumido[]): { categorias: Faceta[]; marcas: Faceta[] } {
  const categorias = new Map<string, Faceta>();
  const marcas = new Map<string, Faceta>();
  for (const p of produtos) {
    const c = p.categoria ? { valor: p.categoria.slug, rotulo: p.categoria.nome } : { valor: SEM_CATEGORIA, rotulo: "Sem categoria" };
    categorias.set(c.valor, { ...c, total: (categorias.get(c.valor)?.total ?? 0) + 1 });
    const m = p.marca ? { valor: p.marca, rotulo: p.marca } : { valor: SEM_MARCA, rotulo: "Sem marca" };
    marcas.set(m.valor, { ...m, total: (marcas.get(m.valor)?.total ?? 0) + 1 });
  }
  const ordenar = (mapa: Map<string, Faceta>) =>
    [...mapa.values()].sort((a, b) => {
      const [sa, sb] = [a.valor.startsWith("~"), b.valor.startsWith("~")];
      return sa !== sb ? (sa ? 1 : -1) : colador.compare(a.rotulo, b.rotulo);
    });
  return { categorias: ordenar(categorias), marcas: ordenar(marcas) };
}

/** Por que este produto aparece numa lista de pendência — em uma frase curta. */
export function pendenciaDoProduto(p: ProdutoResumido): { texto: string; grave: boolean } | null {
  if (!p.ativo) return null;
  if (semFoto(p)) return { texto: "sem foto", grave: true };
  if (anunciaSemSaldo(p)) return { texto: "anuncia estoque que não tem", grave: true };
  if (sobConsulta(p)) return { texto: "sob consulta", grave: false };
  if (p.imagemOrigem === "representativa") return { texto: "foto de outro item da família", grave: false };
  if (p.imagemOrigem === "ilustracao") return { texto: "ilustração, não foto", grave: false };
  return null;
}
