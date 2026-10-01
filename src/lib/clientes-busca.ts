import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Busca e paginação da lista de clientes.
 *
 * A lista carregava todas as organizações com os contadores de cada uma e
 * desenhava tudo numa página. Aqui o banco filtra, ordena e corta a página; a
 * aplicação só recebe as 50 linhas que vão para a tela. Os índices que deixam
 * isto rápido com dezenas de milhares de clientes estão na migração
 * `20260928120000_busca_de_clientes`, e as expressões abaixo precisam ser
 * idênticas às de lá, senão o Postgres não usa o índice.
 */

export const POR_PAGINA = 50;

export const STATUS_CLIENTE = ["ACTIVE", "ONBOARDING", "PAUSED", "ARCHIVED"] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

/** "abertos" é o padrão: tudo menos arquivado. Arquivar é o jeito de tirar da frente sem apagar. */
export type FiltroStatus = "abertos" | "todos" | StatusCliente;

export const ORDENS = ["nome", "recentes", "numero"] as const;
export type Ordem = (typeof ORDENS)[number];

export type FiltroClientes = {
  q: string;
  status: FiltroStatus;
  ordem: Ordem;
  pagina: number;
};

/** Lê a query string sem confiar nela: valor desconhecido vira o padrão. */
export function lerFiltro(params: Record<string, string | string[] | undefined>): FiltroClientes {
  const um = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor) ?? "";
  const q = um(params.q).trim().slice(0, 120);
  const statusBruto = um(params.status);
  const status: FiltroStatus =
    statusBruto === "todos" || (STATUS_CLIENTE as readonly string[]).includes(statusBruto)
      ? (statusBruto as FiltroStatus)
      : "abertos";
  const ordemBruta = um(params.ordem);
  const ordem: Ordem = (ORDENS as readonly string[]).includes(ordemBruta) ? (ordemBruta as Ordem) : "nome";
  const pagina = Math.max(1, Math.min(100_000, Number.parseInt(um(params.pagina), 10) || 1));
  return { q, status, ordem, pagina };
}

/** Mesma dobra de acentos da função `operations.texto_busca` do banco. */
export function dobrarTexto(valor: string): string {
  const de = "áàâãäåéèêëíìîïóòôõöúùûüçñ";
  const para = "aaaaaaeeeeiiiiooooouuuucn";
  return [...valor.toLowerCase()].map((c) => {
    const i = de.indexOf(c);
    return i === -1 ? c : para[i];
  }).join("");
}

function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const TEXTO_ORGANIZACAO = Prisma.sql`operations.texto_busca(x."name" || ' ' || coalesce(x."legal_name", '') || ' ' || coalesce(x."segment", '') || ' ' || x."slug")`;
const TEXTO_CONTATO = Prisma.sql`operations.texto_busca(c."name" || ' ' || coalesce(c."email", ''))`;
const TELEFONE_CONTATO = Prisma.sql`regexp_replace(coalesce(c."phone", '') || ' ' || coalesce(c."whatsapp", ''), '\\D', '', 'g')`;

/**
 * Condição de uma palavra da busca. Cada palavra precisa aparecer em algum
 * lugar do cliente (nome, razão social, segmento, slug, documento, número ou
 * contato); várias palavras se somam com E, que é o que a pessoa espera ao
 * digitar "padaria campinas".
 *
 * Cada lugar é uma subconsulta própria unida por UNION, e não um OR na mesma
 * linha: com OR entre a organização e um EXISTS nos contatos, o Postgres
 * desistia dos índices e lia a tabela inteira (100 ms com 20 mil clientes,
 * crescendo linear). Separado, cada ramo usa o seu índice de trigramas.
 */
function condicaoDaPalavra(palavra: string): Prisma.Sql {
  const texto = `%${escaparLike(dobrarTexto(palavra))}%`;
  const digitos = palavra.replace(/\D/g, "");
  const ramos: Prisma.Sql[] = [
    Prisma.sql`SELECT x.id FROM operations.organizations x WHERE ${TEXTO_ORGANIZACAO} LIKE ${texto}`,
    Prisma.sql`SELECT c.organization_id FROM operations.organization_contacts c WHERE ${TEXTO_CONTATO} LIKE ${texto}`,
  ];
  // Só trata como número o que é número: "3" dentro de "Rua 3" não pode
  // puxar todo CNPJ que tem um 3.
  if (digitos.length >= 3 && digitos.length === palavra.replace(/[\s.\-/()]/g, "").length) {
    const contendo = `%${digitos}%`;
    ramos.push(Prisma.sql`SELECT x.id FROM operations.organizations x WHERE x."cpf_cnpj" LIKE ${contendo}`);
    ramos.push(Prisma.sql`SELECT c.organization_id FROM operations.organization_contacts c WHERE ${TELEFONE_CONTATO} LIKE ${contendo}`);
    if (digitos.length <= 9) {
      ramos.push(Prisma.sql`SELECT x.id FROM operations.organizations x WHERE x."client_number" = ${Number(digitos)}`);
    }
  }
  return Prisma.sql`o.id IN (${Prisma.join(ramos, " UNION ")})`;
}

function condicoes(filtro: FiltroClientes): Prisma.Sql {
  const lista: Prisma.Sql[] = [];
  if (filtro.status === "abertos") lista.push(Prisma.sql`o."status" <> 'ARCHIVED'`);
  else if (filtro.status !== "todos") lista.push(Prisma.sql`o."status" = ${filtro.status}`);

  const palavras = filtro.q.split(/\s+/).filter(Boolean).slice(0, 8);
  for (const palavra of palavras) lista.push(condicaoDaPalavra(palavra));

  return lista.length ? Prisma.sql`WHERE ${Prisma.join(lista, " AND ")}` : Prisma.empty;
}

function ordenacao(filtro: FiltroClientes): Prisma.Sql {
  // Com busca, quem começa com o termo vem antes de quem só o contém: digitar
  // "bri" deve mostrar Brilhax no topo, não "Fabrica Brilho" por ordem alfabética.
  const primeira = filtro.q.split(/\s+/).find(Boolean);
  const prefixo = primeira
    ? Prisma.sql`(operations.texto_busca(o."name") LIKE ${`${escaparLike(dobrarTexto(primeira))}%`}) DESC, `
    : Prisma.empty;
  if (filtro.ordem === "recentes") return Prisma.sql`ORDER BY ${prefixo}o."created_at" DESC, o."id"`;
  if (filtro.ordem === "numero") return Prisma.sql`ORDER BY ${prefixo}o."client_number" ASC`;
  return Prisma.sql`ORDER BY ${prefixo}lower(o."name") ASC, o."id"`;
}

export type ClienteDaLista = Awaited<ReturnType<typeof carregarLinhas>>[number];

async function carregarLinhas(ids: string[]) {
  const linhas = await prisma.organization.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      clientNumber: true,
      name: true,
      legalName: true,
      cpfCnpj: true,
      segment: true,
      status: true,
      createdAt: true,
      _count: { select: { brands: true, projects: true, domains: true, subscriptions: true } },
    },
  });
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  return ids.map((id) => porId.get(id)).filter((linha) => linha !== undefined);
}

export async function buscarClientes(filtro: FiltroClientes) {
  const onde = condicoes(filtro);
  const deslocamento = (filtro.pagina - 1) * POR_PAGINA;

  const [ids, [{ total }]] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM operations.organizations o
      ${onde}
      ${ordenacao(filtro)}
      LIMIT ${POR_PAGINA} OFFSET ${deslocamento}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM operations.organizations o ${onde}
    `,
  ]);

  const totalNumero = Number(total);
  return {
    itens: await carregarLinhas(ids.map((linha) => linha.id)),
    total: totalNumero,
    pagina: filtro.pagina,
    paginas: Math.max(1, Math.ceil(totalNumero / POR_PAGINA)),
    inicio: totalNumero === 0 ? 0 : deslocamento + 1,
  };
}

/** Os números do topo, contados no banco em vez de somados na página. */
export async function resumoDosClientes() {
  const [porStatus, marcas, projetos] = await Promise.all([
    prisma.organization.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.brand.count(),
    prisma.project.count(),
  ]);
  const contagem = (status: string) => porStatus.find((linha) => linha.status === status)?._count._all ?? 0;
  const total = porStatus.reduce((soma, linha) => soma + linha._count._all, 0);
  return {
    abertos: total - contagem("ARCHIVED"),
    ativos: contagem("ACTIVE"),
    implantacao: contagem("ONBOARDING"),
    arquivados: contagem("ARCHIVED"),
    marcas,
    projetos,
  };
}
