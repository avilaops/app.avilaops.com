/**
 * Tipos, constantes e formatação da tela de Newsletter. Extraídos sem
 * alteração do NewsletterStudio original; as abas e o orquestrador
 * compartilham este arquivo em vez de redeclarar cada forma.
 */

export type Contact = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  source: string;
  status: string;
  tags: string[];
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  format: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  audienceTags: string[];
  createdAt: string;
  sentAt: string | null;
};

export type Overview = {
  metrics: { subscribed: number; unsubscribed: number; total: number; campaignsSent: number };
  tags: { tag: string; count: number }[];
  campaigns: Campaign[];
  contacts: Contact[];
};

export type Readiness = { ready: boolean; driver: string; reason: string };

export type Draft = {
  id: string | null;
  name: string;
  subject: string;
  previewText: string;
  format: "HTML" | "TEXT" | "IMAGE";
  html: string;
  text: string;
  imageUrl: string;
  imageAlt: string;
  imageLinkUrl: string;
  audienceTags: string[];
};

export type Aba = "contatos" | "campanha" | "historico";

export type Previa = { html: string; recipients: number };

export const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  subject: "",
  previewText: "",
  format: "HTML",
  html: "",
  text: "",
  imageUrl: "",
  imageAlt: "",
  imageLinkUrl: "",
  audienceTags: [],
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SENDING: "Enviando",
  SENT: "Enviada",
  FAILED: "Falhou",
  SUBSCRIBED: "Inscrito",
  UNSUBSCRIBED: "Descadastrado",
  BOUNCED: "Retornou",
};

export const FORMAT_LABEL: Record<string, string> = {
  HTML: "HTML",
  TEXT: "Mensagem",
  IMAGE: "Imagem",
};

export function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
