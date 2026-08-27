/**
 * Vocabulário das vagas, sem nenhuma dependência de Prisma.
 *
 * Vive separado de `job-postings.ts` porque os formulários do painel são
 * componentes de cliente: importar o módulo que abre o PrismaClient levaria o
 * driver do banco para o bundle do navegador. `job-postings.ts` reexporta tudo
 * daqui, então o código de servidor continua tendo um único ponto de entrada.
 */
export const JOB_STATUSES = ["DRAFT", "PUBLISHED", "PAUSED", "CLOSED"] as const;

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "No ar",
  PAUSED: "Pausada",
  CLOSED: "Encerrada",
};

export const LOCATION_TYPES = ["Presencial", "Híbrido", "Remoto"] as const;

export const CONTRACTS = [
  "Tempo integral",
  "Meio período",
  "Estágio",
  "Freelance",
  "Parceria",
] as const;

export const APPLICATION_STAGES = [
  "RECEIVED",
  "SCREENING",
  "INTERVIEW",
  "CHALLENGE",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  RECEIVED: "Recebida",
  SCREENING: "Triagem",
  INTERVIEW: "Entrevista",
  CHALLENGE: "Desafio",
  OFFER: "Proposta",
  HIRED: "Contratada",
  REJECTED: "Recusada",
  WITHDRAWN: "Desistiu",
};

export type JobPostingContent = {
  intro: string[];
  responsibilities: { title: string; body: string; items: string[] }[];
  expertise: string[];
  closing: string[];
  benefits: string[];
  travel?: string;
};
