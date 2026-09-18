/** Tipos do Estúdio que trafegam entre servidor e tela (sem prisma, sem node). */
import type { Formato, Marca, Valores } from "./templates";

export type Trilha = { bpm: number; semente: number; db: number };

export const TRILHA_PADRAO: Trilha = { bpm: 120, semente: 7, db: -12 };

export type StatusRender = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export type RenderDTO = {
  id: string;
  tipo: "video" | "imagem";
  status: StatusRender;
  largura: number;
  altura: number;
  fps: number;
  duracao: number | null;
  arquivoUrl: string | null;
  mimeType: string | null;
  tamanho: number | null;
  log: string | null;
  criadoEm: string;
  terminadoEm: string | null;
};

export type PecaDTO = {
  id: string;
  titulo: string;
  /** Nulo = peça da casa. Com cliente, a peça renderiza com a marca dele. */
  cliente: { id: string; nome: string } | null;
  templateId: string;
  formato: Formato;
  valores: Valores;
  duracao: number | null;
  narracao: boolean;
  voz: string;
  trilha: Trilha | null;
  criadoEm: string;
  atualizadoEm: string;
  renders: RenderDTO[];
  /** Só em obterPeca(): a lista não carrega a logo em base64. */
  marca?: Marca;
};

export const ROTULO_STATUS: Record<StatusRender, string> = {
  PENDING: "Na fila",
  RUNNING: "Renderizando",
  DONE: "Pronto",
  FAILED: "Falhou",
};
