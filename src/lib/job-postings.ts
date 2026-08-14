import type { JobPosting } from "@prisma/client";

import { cleanText } from "./http";
import { prisma } from "./prisma";

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

export type JobPostingContent = {
  intro: string[];
  responsibilities: { title: string; body: string; items: string[] }[];
  expertise: string[];
  closing: string[];
  benefits: string[];
  travel?: string;
};

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

export const JOB_STATUSES = ["DRAFT", "PUBLISHED", "PAUSED", "CLOSED"] as const;
export const LOCATION_TYPES = ["Presencial", "Híbrido", "Remoto"] as const;
export const CONTRACTS = [
  "Tempo integral",
  "Meio período",
  "Estágio",
  "Freelance",
  "Parceria",
] as const;

/** Lista para o painel, com quantas candidaturas cada vaga tem. */
export async function listJobPostings() {
  return prisma.jobPosting.findMany({
    orderBy: [{ status: "asc" }, { postedAt: "desc" }, { ref: "asc" }],
    include: { _count: { select: { applications: true } } },
  });
}

export async function getJobPostingById(id: string) {
  return prisma.jobPosting.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
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

type RawBody = Record<string, unknown> | null;

const lines = (value: unknown, max = 40): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => cleanText(item, 1200))
        .filter((item) => item.length > 0)
        .slice(0, max)
    : [];

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
    locationType: cleanText(body?.locationType, 40) || "Remoto",
    contract: cleanText(body?.contract, 40) || "Tempo integral",
    summary: cleanText(body?.summary, 400),
    content,
    postedAt: parseDay(body?.postedAt, "start"),
    validThrough: parseDay(body?.validThrough, "end"),
  };
}
