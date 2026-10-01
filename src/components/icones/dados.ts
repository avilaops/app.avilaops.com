import type { ResultadoIcones } from "@/lib/icones/auditoria";
import type { prisma } from "@/lib/prisma";

/**
 * Tipos e derivações do módulo de Ícones, compartilhados entre a página (que
 * consulta o banco) e os componentes de servidor que desenham cada vista.
 * Nada aqui consulta banco, no mesmo arranjo de `components/seo/dados.ts`.
 */

export const BASE = "/hub-social/icones";

export type Params = { domain?: string };

export type Conexao = Awaited<ReturnType<typeof prisma.integrationConnection.findFirst>>;

/** O resultado gravado no `metadata` da conexão, quando já houve auditoria. */
export type Auditoria = ResultadoIcones;

export type ItemDominio = {
  fqdn: string;
  organizacao: string;
  auditoria: Auditoria | undefined;
  conexao: Conexao;
};

export const hrefDominio = (fqdn: string) => `${BASE}?domain=${encodeURIComponent(fqdn)}`;

export const conexaoSerializada = (conexao: Conexao) =>
  conexao
    ? {
        id: conexao.id,
        status: conexao.status,
        lastSyncedAt: conexao.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: conexao.lastSyncStatus,
        lastSyncError: conexao.lastSyncError,
        metadata: conexao.metadata,
      }
    : null;

/** Quantos itens do padrão passaram, para a linha da lista dizer "7 de 9". */
export function aprovados(auditoria: Auditoria | undefined): { ok: number; total: number } {
  if (!auditoria) return { ok: 0, total: 0 };
  return { ok: auditoria.itens.filter((i) => i.ok).length, total: auditoria.itens.length };
}
