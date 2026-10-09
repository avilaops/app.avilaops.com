/**
 * O catálogo de uma loja, visto pelo painel da Ávila Ops.
 *
 * Quem filtra, ordena, pagina e conta é a plataforma de lojas, no banco dela
 * (`GET …/produtos/consulta`). O painel não recebe mais o catálogo: recebe a
 * página pedida e os totais. O que mora aqui é o que é do painel:
 *
 * - a consulta no endereço (`?q=…&marca=…&ordem=…`), para link direto e botão
 *   voltar funcionarem sem estado guardado no navegador;
 * - a tradução dessa consulta para a da plataforma;
 * - os rótulos e a frase curta de cada pendência.
 *
 * As definições são as da plataforma (`catalogo-admin-consulta.ts` de lá), e o
 * painel só as nomeia:
 * - preço zero é "sob consulta" — a loja mostra e negocia pelo WhatsApp. O
 *   modelo não tem preço nulo: ausência e zero são o mesmo valor gravado;
 * - estoque vem das variações (saldo físico menos reservado) e tem três
 *   estados que não se confundem: `desconhecido` (sem saldo cadastrado),
 *   `nao-controla` (a loja não conta este item) e `controlado` (há número, que
 *   pode ser zero);
 * - esgotado declarado (`out_of_stock`) não é "anuncia sem saldo".
 */

export type EstadoDoEstoque = "desconhecido" | "nao-controla" | "controlado";

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
  /** Disponível para venda, somado nas variações. `null` quando o estado não é `controlado`. */
  estoque: number | null;
  estoqueEstado: EstadoDoEstoque;
  /** Quantas variações (grade) o produto tem. Zero é apresentação única. */
  variacoes: number;
  /** Versão do cadastro na plataforma: quem edita manda a que estava olhando. */
  versaoCatalogo: number;
  atualizadoEm: string;
  criadoEm: string;
  categoria: { nome: string; slug: string } | null;
}

/* ───────────────────────── rótulos ───────────────────────── */

export const semFoto = (p: ProdutoResumido) => p.fotos === 0;
export const sobConsulta = (p: ProdutoResumido) => p.precoCentavos <= 0;
/** Diz "em estoque" na vitrine e a contagem das variações está zerada. */
export const anunciaSemSaldo = (p: ProdutoResumido) =>
  p.disponibilidade === "in_stock" && p.estoqueEstado === "controlado" && (p.estoque ?? 0) <= 0;

export type Pendencia = "sem-foto" | "sob-consulta" | "anuncia-sem-saldo" | "foto-de-outro";

export const PENDENCIAS: { valor: Pendencia; rotulo: string }[] = [
  { valor: "sem-foto", rotulo: "Sem foto" },
  { valor: "sob-consulta", rotulo: "Sem preço (sob consulta)" },
  { valor: "anuncia-sem-saldo", rotulo: "Anuncia estoque que não tem" },
  { valor: "foto-de-outro", rotulo: "Foto de outro item" },
];

export type FiltroDeEstoque = "" | "com-saldo" | "zerado" | "nao-controla" | "desconhecido";
export const ESTOQUES: { valor: Exclude<FiltroDeEstoque, "">; rotulo: string }[] = [
  { valor: "com-saldo", rotulo: "Com saldo" },
  { valor: "zerado", rotulo: "Zerado" },
  { valor: "nao-controla", rotulo: "Não controla estoque" },
  { valor: "desconhecido", rotulo: "Sem saldo cadastrado" },
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
    estoque: entre(um(bruto.estoque), ["com-saldo", "zerado", "nao-controla", "desconhecido"] as const, "" as FiltroDeEstoque),
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

/* ───────────────────────── a consulta da plataforma ───────────────────────── */

/**
 * A consulta do painel no formato que a plataforma lê. Preço vai em centavos;
 * o resto tem o mesmo nome dos dois lados, de propósito.
 */
export function queryDaPlataforma(c: Consulta): string {
  const query = new URLSearchParams();
  if (c.q) query.set("q", c.q);
  if (c.categoria) query.set("categoria", c.categoria);
  if (c.marca) query.set("marca", c.marca);
  if (c.situacao) query.set("situacao", c.situacao);
  for (const p of c.pendencias) query.append("pend", p);
  if (c.estoque) query.set("estoque", c.estoque);
  if (c.precoMin !== null) query.set("min", String(c.precoMin));
  if (c.precoMax !== null) query.set("max", String(c.precoMax));
  query.set("ordem", c.ordem);
  if (c.grupo) query.set("grupo", c.grupo);
  query.set("por", String(c.por));
  query.set("pagina", String(c.pagina));
  return query.toString();
}

export type ResumoDoCatalogo = {
  total: number;
  ativos: number;
  inativos: number;
  /** Os quatro abaixo contam só produto ATIVO: rascunho incompleto é trabalho em andamento. */
  semFoto: number;
  sobConsulta: number;
  anunciaSemSaldo: number;
  fotoDeOutroItem: number;
  /** Como a loja trata estoque, em número de produtos. */
  controlamEstoque: number;
  naoControlamEstoque: number;
  estoqueDesconhecido: number;
  comVariacoes: number;
};

export type Faceta = { valor: string; rotulo: string; total: number };

/** O que a plataforma devolve para uma consulta: a página e os totais. */
export type PaginaDoCatalogo = {
  itens: ProdutoResumido[];
  total: number;
  pagina: number;
  paginas: number;
  por: number;
  /** Posição do primeiro e do último item da página no resultado, contando de 1. Zero quando vazio. */
  de: number;
  ate: number;
  /** Total de cada grupo no resultado INTEIRO, quando a consulta agrupa. */
  grupos: { chave: string; total: number }[];
  /** Indicadores do catálogo inteiro da loja: não mudam com o filtro. */
  resumo: ResumoDoCatalogo;
  facetas: { categorias: Faceta[]; marcas: Faceta[] };
  /** Quando a plataforma leu isto no banco dela. */
  lidoEm: string;
};

export function chaveDoGrupo(p: ProdutoResumido, grupo: Agrupamento): string {
  if (grupo === "categoria") return p.categoria?.nome ?? "Sem categoria";
  if (grupo === "marca") return p.marca || "Sem marca";
  if (grupo === "situacao") return p.ativo ? "Ativos" : "Inativos";
  return "";
}

export type GrupoNaPagina = { chave: string; total: number; itens: ProdutoResumido[] };

/**
 * Parte a página em grupos, na ordem em que a plataforma os mandou, com o
 * total que ela contou para o grupo INTEIRO.
 *
 * Um grupo pode atravessar páginas; o número ao lado do nome é o do grupo, não
 * o das linhas que couberam nesta página.
 */
export function agruparPagina(pagina: Pick<PaginaDoCatalogo, "itens" | "grupos" | "total">, grupo: Agrupamento): GrupoNaPagina[] {
  if (!grupo) return [{ chave: "", total: pagina.total, itens: pagina.itens }];
  const totais = new Map(pagina.grupos.map((g) => [g.chave, g.total]));
  const grupos: GrupoNaPagina[] = [];
  for (const p of pagina.itens) {
    const chave = chaveDoGrupo(p, grupo);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(p);
    else grupos.push({ chave, total: totais.get(chave) ?? 0, itens: [p] });
  }
  return grupos;
}

/** A consulta que um indicador abre: a mesma regra da contagem, por construção. */
export function consultaDoIndicador(pendencia: Pendencia): Partial<Consulta> {
  return { situacao: "ativos", pendencias: [pendencia], q: "", categoria: "", marca: "", estoque: "", precoMin: null, precoMax: null };
}

/** O indicador está selecionado quando a consulta é exatamente a que ele abre. */
export function indicadorSelecionado(c: Consulta, pendencia: Pendencia): boolean {
  return c.situacao === "ativos" && c.pendencias.length === 1 && c.pendencias[0] === pendencia && filtrosAtivos(c) === 2;
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
