/** Tipos do Estúdio que trafegam entre servidor e tela (sem prisma, sem node). */
import type { Formato, Valores } from "./templates";

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
};

export const ROTULO_STATUS: Record<StatusRender, string> = {
  PENDING: "na fila",
  RUNNING: "renderizando",
  DONE: "pronto",
  FAILED: "falhou",
};
