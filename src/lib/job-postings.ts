import type { JobPosting } from "@prisma/client";

import { cleanText } from "./http";
import {
  CONTRACTS,
  JOB_STATUSES,
  LOCATION_TYPES,
  type JobPostingContent,
} from "./job-postings.constants";
import { prisma } from "./prisma";

export * from "./job-postings.constants";

/**
 * Vagas de jobs.avilaops.com.
 *
 * Datas: o banco guarda instante em UTC, porque `valid_through` decide se a
 * vaga ainda aparece e isso não pode depender do fuso de quem roda o build. O
 * site, por outro lado, sempre falou em dia (`YYYY-MM-DD`) — tanto no texto
 * quanto no JSON-LD. A conversão entre os dois mora aqui, num lugar só.
 *
 * O fuso de referência é o do negócio, não o do servidor.
 */
export const BUSINESS_TIMEZONE = "America/Sao_Paulo";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `2026-10-31` → primeiro instante daquele dia em São Paulo, em UTC. */
export function startOfBusinessDay(day: string): Date {
  return new Date(`${day}T00:00:00.000-03:00`);
}

/**
 * `2026-10-31` → último instante daquele dia em São Paulo, em UTC.
 * A inscrição vale até o fim do dia informado, não até a meia-noite do começo.
 */
export function endOfBusinessDay(day: string): Date {
  return new Date(`${day}T23:59:59.999-03:00`);
}

/** Instante → `YYYY-MM-DD` no fuso do negócio. */
export function toBusinessDay(value: Date | null): string | null {
  return value ? dayFormatter.format(value) : null;
}

/** Formato consumido pelo build do site — mesmo shape do antigo `jobs.ts`. */
export type PublicJobPosting = {
  slug: string;
  ref: string;
  title: string;
  area: string;
  team: string;
  location: string;
  locationType: string;
  contract: string;
  summary: string;
  postedAt: string;
  validThrough: string;
} & JobPostingContent;

export function serializeJobPosting(posting: JobPosting): PublicJobPosting {
  const content = posting.content as JobPostingContent;

  return {
    slug: posting.slug,
    ref: posting.ref,
    title: posting.title,
    area: posting.area,
    team: posting.team,
    location: posting.location,
    locationType: posting.locationType,
    contract: posting.contract,
    summary: posting.summary,
    // `!` seguro: o CHECK `job_postings_published_requires_dates` garante que
    // vaga PUBLISHED tem as duas datas, e só PUBLISHED chega aqui.
    postedAt: toBusinessDay(posting.postedAt)!,
    validThrough: toBusinessDay(posting.validThrough)!,
    intro: content.intro ?? [],
    // Reconstruído campo a campo de propósito. O `jsonb` do Postgres não
    // preserva ordem de chave (reordena por tamanho e byte), então devolver o
    // objeto cru faria o mesmo conteúdo gerar HTML diferente a cada ida ao
    // banco — o build deixaria de ser reprodutível.
    responsibilities: (content.responsibilities ?? []).map((group) => ({
      title: group.title,
      body: group.body,
      items: group.items,
    })),
    expertise: content.expertise ?? [],
    closing: content.closing ?? [],
    benefits: content.benefits ?? [],
    ...(content.travel ? { travel: content.travel } : {}),
  };
}

/**
 * Ordem do painel: o que está no ar primeiro, o que já morreu por último.
 * Deliberadamente diferente da ordem da API pública — lá a ordem existe para o
 * build ser reprodutível, aqui para o operador ver o que importa antes.
 */
const STATUS_RANK: Record<string, number> = {
  PUBLISHED: 0,
  PAUSED: 1,
  DRAFT: 2,
  CLOSED: 3,
};

export type JobPostingFilters = {
  status?: string;
  area?: string;
  q?: string;
};

/** Lista para o painel, com quantas candidaturas cada vaga tem. */
export async function listJobPostings(filters: JobPostingFilters = {}) {
  const status = filters.status?.trim().toUpperCase();
  const area = filters.area?.trim();
  const q = filters.q?.trim();

  const postings = await prisma.jobPosting.findMany({
    where: {
      ...(status && (JOB_STATUSES as readonly string[]).includes(status)
        ? { status }
        : {}),
      ...(area ? { area } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { ref: { contains: q, mode: "insensitive" as const } },
              { summary: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    // `nulls: "last"` porque rascunho sem data não pode encabeçar a lista: no
    // Postgres, `DESC` joga NULL para o topo por padrão.
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { ref: "asc" }],
    include: { _count: { select: { applications: true } } },
  });

  // `sort` é estável, então dentro do mesmo status a ordem do banco se mantém.
  return postings.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );
}

/** Áreas já cadastradas, para o filtro do painel não ser uma lista fixa. */
export async function listJobAreas(): Promise<string[]> {
  const rows = await prisma.jobPosting.findMany({
    distinct: ["area"],
    select: { area: true },
    orderBy: { area: "asc" },
  });
  return rows.map((row) => row.area);
}

export async function getJobPostingById(id: string) {
  return prisma.jobPosting.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
}

/** Vaga + quantas candidaturas há em cada estágio do funil. */
export async function getJobPostingDetail(id: string) {
  const posting = await getJobPostingById(id);
  if (!posting) return null;

  const grouped = await prisma.jobApplication.groupBy({
    by: ["stage"],
    where: { jobPostingId: id, deletedAt: null },
    _count: { _all: true },
  });

  return {
    ...posting,
    stageCounts: Object.fromEntries(
      grouped.map((row) => [row.stage, row._count._all]),
    ) as Record<string, number>,
  };
}

/** Uma vaga publicada e ainda no prazo? Usado na listagem do painel. */
export function isExpired(posting: {
  status: string;
  validThrough: Date | null;
}): boolean {
  return (
    posting.status === "PUBLISHED" &&
    posting.validThrough !== null &&
    posting.validThrough.getTime() <= Date.now()
  );
}

/**
 * O que precisa estar preenchido para a vaga poder ir ao ar.
 *
 * Não é preciosismo: sem essas datas o `CHECK` do banco recusa o UPDATE, e sem
 * o corpo o JSON-LD JobPosting sai vazio e o Google Jobs ignora o anúncio.
 * Devolve a lista de pendências — vazia quer dizer que dá para publicar.
 */
export function publishBlockers(posting: {
  title: string;
  location: string;
  contract: string;
  summary: string;
  postedAt: Date | null;
  validThrough: Date | null;
  content: unknown;
}): string[] {
  const blockers: string[] = [];
  const content = (posting.content ?? {}) as Partial<JobPostingContent>;

  if (!posting.title?.trim()) blockers.push("Título é obrigatório.");
  if (!posting.location?.trim()) blockers.push("Local é obrigatório.");
  if (!posting.contract?.trim()) blockers.push("Contrato é obrigatório.");
  if (!posting.summary?.trim()) blockers.push("Resumo é obrigatório.");
  if (!posting.postedAt) blockers.push("Data de publicação é obrigatória.");
  if (!posting.validThrough) {
    blockers.push("Data limite de inscrição é obrigatória.");
  } else if (posting.validThrough.getTime() <= Date.now()) {
    blockers.push(
      "A data limite de inscrição já passou — atualize antes de publicar.",
    );
  }
  if (!content.intro?.length) blockers.push("Escreva ao menos um parágrafo de introdução.");
  if (!content.responsibilities?.length) {
    blockers.push("Cadastre ao menos um bloco de responsabilidades.");
  }
  if (!content.expertise?.length) {
    blockers.push("Cadastre ao menos um item de conhecimento/expertise.");
  }

  return blockers;
}

/** `Nome da Vaga` → `nome-da-vaga`, único dentro de job_postings. */
export async function generateSlug(title: string, ignoreId?: string): Promise<string> {
  const base =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "vaga";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.jobPosting.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken || taken.id === ignoreId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** `AVL-2026-007` — sequencial por ano, legível no assunto do e-mail. */
export async function generateRef(year = new Date().getFullYear()): Promise<string> {
  const prefix = `AVL-${year}-`;
  const ultima = await prisma.jobPosting.findFirst({
    where: { ref: { startsWith: prefix } },
    orderBy: { ref: "desc" },
    select: { ref: true },
  });
  const proximo = ultima ? Number(ultima.ref.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(proximo).padStart(3, "0")}`;
}

/**
 * Estado de publicação do site de vagas.
 *
 * O site é export estático: editar a vaga no banco não muda o HTML no ar até
 * alguém rodar o build. O carimbo abaixo é o que permite ao painel avisar
 * "site desatualizado" em vez de deixar o operador achar que publicou.
 *
 * Reaproveita `integration_connections`, no mesmo molde já usado por
 * `google_search_console` e `indexnow` — não precisa de tabela nova.
 *
 * Limite conhecido: o carimbo marca quando o build **leu** as vagas, não
 * quando o site foi publicado. Um build que lê e falha depois deixa o painel
 * otimista. É por isso que a interface diz "última leitura do build", e não
 * "última publicação". Fechar essa lacuna depende do gatilho de rebuild, que
 * ainda é decisão em aberto (ver `docs/MODULO-RECRUTAMENTO.md`).
 */
export const JOBS_SITE_URL = process.env.JOBS_SITE_URL ?? "https://jobs.avilaops.com";
const JOBS_BUILD_PROVIDER = "jobs_site_build";

export async function recordJobsSiteRead(total: number): Promise<void> {
  const now = new Date();
  try {
    await prisma.integrationConnection.upsert({
      where: {
        provider_siteUrl: { provider: JOBS_BUILD_PROVIDER, siteUrl: JOBS_SITE_URL },
      },
      create: {
        provider: JOBS_BUILD_PROVIDER,
        siteUrl: JOBS_SITE_URL,
        status: "ACTIVE",
        lastSyncedAt: now,
        lastSyncStatus: "SUCCESS",
        metadata: { postings: total },
      },
      update: {
        status: "ACTIVE",
        lastSyncedAt: now,
        lastSyncStatus: "SUCCESS",
        lastSyncError: null,
        metadata: { postings: total },
      },
    });
  } catch {
    // O carimbo é diagnóstico. Se ele falhar, o build ainda precisa receber as
    // vagas — derrubar a resposta aqui quebraria a publicação do site por causa
    // de um indicador.
  }
}

export type JobsSiteStatus = {
  lastReadAt: Date | null;
  pendingSince: Date | null;
  stale: boolean;
};

export async function getJobsSiteStatus(): Promise<JobsSiteStatus> {
  const [connection, ultimaEdicao] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: {
        provider_siteUrl: { provider: JOBS_BUILD_PROVIDER, siteUrl: JOBS_SITE_URL },
      },
      select: { lastSyncedAt: true },
    }),
    prisma.jobPosting.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { atualizadoEm: "desc" },
      select: { atualizadoEm: true },
    }),
  ]);

  const lastReadAt = connection?.lastSyncedAt ?? null;
  const pendingSince = ultimaEdicao?.atualizadoEm ?? null;

  return {
    lastReadAt,
    pendingSince,
    stale: pendingSince !== null && (lastReadAt === null || pendingSince > lastReadAt),
  };
}

type RawBody = Record<string, unknown> | null;

const lines = (value: unknown, max = 40): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => cleanText(item, 1200))
        .filter((item) => item.length > 0)
        .slice(0, max)
    : [];

function pickFrom<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const text = cleanText(value, 40);
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

/** `YYYY-MM-DD` do formulário → instante UTC, ou null quando vazio. */
function parseDay(value: unknown, edge: "start" | "end"): Date | null {
  const raw = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return edge === "start" ? startOfBusinessDay(raw) : endOfBusinessDay(raw);
}

/**
 * Corpo do formulário do painel → campos da vaga.
 *
 * Não decide status: publicar e encerrar têm rotas próprias, para a transição
 * passar sempre pela validação e pela auditoria.
 */
export function readPostingPayload(body: RawBody) {
  const content: JobPostingContent = {
    intro: lines(body?.intro),
    responsibilities: Array.isArray(body?.responsibilities)
      ? (body.responsibilities as RawBody[])
          .map((group) => ({
            title: cleanText(group?.title, 140),
            body: cleanText(group?.body, 600),
            items: lines(group?.items),
          }))
          .filter((group) => group.title.length > 0)
          .slice(0, 12)
      : [],
    expertise: lines(body?.expertise),
    closing: lines(body?.closing),
    benefits: lines(body?.benefits),
  };

  const travel = cleanText(body?.travel, 400);
  if (travel) content.travel = travel;

  return {
    title: cleanText(body?.title, 160),
    area: cleanText(body?.area, 80) || "Geral",
    team: cleanText(body?.team, 80) || "Avila Ops",
    location: cleanText(body?.location, 160),
    // Vocabulário fechado: `locationType` e `contract` viram `jobLocationType` e
    // `employmentType` no JSON-LD, e valor inventado faz o Google Jobs recusar o
    // anúncio inteiro em vez de ignorar o campo.
    locationType: pickFrom(body?.locationType, LOCATION_TYPES, "Remoto"),
    contract: pickFrom(body?.contract, CONTRACTS, "Tempo integral"),
    summary: cleanText(body?.summary, 400),
    content,
    postedAt: parseDay(body?.postedAt, "start"),
    validThrough: parseDay(body?.validThrough, "end"),
  };
}
