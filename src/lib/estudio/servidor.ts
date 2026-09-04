import crypto, { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Prisma, StudioPiece, StudioRender } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isServiceCall } from "@/lib/service-auth";
import { publicBaseUrl } from "@/lib/newsletter";
import { DIMENSOES, MARCA_PADRAO, templatePorId, valoresPadrao, type Formato, type Narracao, type Valores } from "./templates";
import { TRILHA_PADRAO, type PecaDTO, type RenderDTO, type StatusRender, type Trilha } from "./tipos";

export const FORMATOS: Formato[] = ["9:16", "1:1", "4:5"];

type PecaComRenders = StudioPiece & { renders: StudioRender[] };

const comRenders = { renders: { orderBy: { createdAt: "desc" as const }, take: 20 } };

export async function listarPecas(): Promise<PecaDTO[]> {
  const pecas = await prisma.studioPiece.findMany({ orderBy: { updatedAt: "desc" }, include: comRenders });
  return pecas.map(paraDTO);
}

export async function obterPeca(id: string): Promise<PecaDTO | null> {
  const peca = await prisma.studioPiece.findUnique({ where: { id }, include: comRenders });
  return peca ? paraDTO(peca) : null;
}

export function paraDTO(p: PecaComRenders): PecaDTO {
  return {
    id: p.id,
    titulo: p.title,
    templateId: p.templateId,
    formato: (FORMATOS.includes(p.format as Formato) ? p.format : "9:16") as Formato,
    valores: (p.values ?? {}) as Valores,
    duracao: p.duration,
    narracao: p.narration,
    voz: p.voice,
    trilha: lerTrilha(p.soundtrack),
    criadoEm: p.createdAt.toISOString(),
    atualizadoEm: p.updatedAt.toISOString(),
    renders: p.renders.map(renderParaDTO),
  };
}

export function renderParaDTO(r: StudioRender): RenderDTO {
  return {
    id: r.id,
    tipo: r.kind === "video" ? "video" : "imagem",
    status: r.status as StatusRender,
    largura: r.width,
    altura: r.height,
    fps: r.fps,
    duracao: r.duration,
    arquivoUrl: r.fileName ? `/api/estudio/arquivos/${r.fileName}` : null,
    mimeType: r.mimeType,
    tamanho: r.sizeBytes,
    log: r.log,
    criadoEm: r.createdAt.toISOString(),
    terminadoEm: r.finishedAt?.toISOString() ?? null,
  };
}

function lerTrilha(json: Prisma.JsonValue | null): Trilha | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  return {
    bpm: Number(o.bpm) || TRILHA_PADRAO.bpm,
    semente: Number(o.semente) || TRILHA_PADRAO.semente,
    db: typeof o.db === "number" ? o.db : TRILHA_PADRAO.db,
  };
}

/** Só aceita chaves que o template declara; o resto cai fora. */
export function saneiaValores(templateId: string, entrada: unknown): Valores {
  const t = templatePorId(templateId);
  if (!t) return {};
  const base = valoresPadrao(t);
  if (!entrada || typeof entrada !== "object") return base;
  const o = entrada as Record<string, unknown>;
  for (const campo of t.campos) {
    const v = o[campo.chave];
    if (typeof v === "string") base[campo.chave] = v.slice(0, 4000);
  }
  return base;
}

export function saneiaTrilha(entrada: unknown): Trilha | null {
  if (entrada === null || entrada === undefined || entrada === false) return null;
  if (typeof entrada !== "object") return TRILHA_PADRAO;
  const o = entrada as Record<string, unknown>;
  const bpm = Math.min(180, Math.max(60, Math.round(Number(o.bpm) || TRILHA_PADRAO.bpm)));
  const semente = Math.max(0, Math.round(Number(o.semente) || TRILHA_PADRAO.semente));
  const db = Math.min(0, Math.max(-30, Number(o.db) ?? TRILHA_PADRAO.db));
  return { bpm, semente, db: Number.isFinite(db) ? db : TRILHA_PADRAO.db };
}

/** HTML completo de uma peça (ou de um pedido congelado), pronto para iframe ou Chromium. */
export function htmlDaPeca(dados: { templateId: string; formato: Formato; valores: Valores; duracao: number | null }): string | null {
  const t = templatePorId(dados.templateId);
  if (!t) return null;
  const duracao = t.tipo === "video" ? dados.duracao ?? t.duracaoPadrao ?? 5 : 0;
  return t.html(dados.valores, dados.formato, MARCA_PADRAO, duracao);
}

export type Snapshot = {
  templateId: string;
  formato: Formato;
  valores: Valores;
  duracao: number | null;
  narracao: Narracao[];
  voz: string;
  trilha: Trilha | null;
  token: string;
};

/** Congela o pedido de renderização a partir da peça como ela está agora. */
export function montarSnapshot(peca: PecaDTO): { snapshot: Snapshot; kind: "video" | "image"; largura: number; altura: number; duracao: number | null } {
  const t = templatePorId(peca.templateId);
  if (!t) throw new Error("Template desconhecido.");
  const { largura, altura } = DIMENSOES[peca.formato];
  const video = t.tipo === "video";
  const duracao = video ? Math.min(60, Math.max(1, peca.duracao ?? t.duracaoPadrao ?? 5)) : null;
  const narracao = video && peca.narracao && t.narracao ? t.narracao(peca.valores, duracao!) : [];
  return {
    kind: video ? "video" : "image",
    largura,
    altura,
    duracao,
    snapshot: {
      templateId: peca.templateId,
      formato: peca.formato,
      valores: peca.valores,
      duracao,
      narracao,
      voz: peca.voz || "pm_nicolas",
      trilha: video ? peca.trilha : null,
      token: crypto.randomBytes(16).toString("hex"),
    },
  };
}

/** O que o worker recebe ao pegar um trabalho da fila. */
export function trabalhoParaWorker(r: StudioRender) {
  const s = r.snapshot as unknown as Snapshot;
  return {
    id: r.id,
    tipo: r.kind === "video" ? "video" : "imagem",
    largura: r.width,
    altura: r.height,
    fps: r.fps,
    duracao: r.duration ?? 0,
    htmlUrl: `${publicBaseUrl()}/api/estudio/renders/${r.id}/html?token=${s.token}`,
    narracao: s.narracao ?? [],
    voz: s.voz ?? "pm_nicolas",
    trilha: s.trilha ?? null,
  };
}

/** O worker se identifica por `x-estudio-token`; a chave de serviço do n8n também vale. */
export function ehChamadaDoWorker(request: NextRequest): boolean {
  const esperado = process.env.ESTUDIO_WORKER_TOKEN ?? "";
  const recebido = request.headers.get("x-estudio-token") ?? "";
  if (esperado && recebido) {
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return isServiceCall(request);
}
