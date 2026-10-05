import { prisma } from "@/lib/prisma";

/**
 * Leitura da auditoria do envio de cobrança (`operations.audit_events`), que
 * `responderEnvio` grava em dois tempos: a intenção antes e o desfecho depois,
 * com o id da intenção em `metadata.tentativaId`.
 */

const INTENCAO = "COBRANCA_ENVIO_INICIADO";
const DESFECHOS = ["COBRANCA_ENVIADA", "COBRANCA_ENVIO_FALHOU", "COBRANCA_ENVIO_RECUSADO", "COBRANCA_ENVIO_ERRO"];

const DIA_MS = 24 * 60 * 60 * 1000;

export type EnvioSemDesfecho = {
  /** Id da intenção — o `tentativaId` que o desfecho levaria. */
  tentativaId: string;
  iniciadoEm: Date;
  actorId: string | null;
  /** `null` nas intenções gravadas antes de 05/10/2026, que saíam sem o cliente. */
  organizationId: string | null;
  entityType: string;
  entityId: string | null;
  /** O pedido como foi gravado: canal, conteúdo, teste e o destino do teste. */
  pedido: unknown;
};

/**
 * Intenções de envio que ficaram sem desfecho: "pode ter saído e não sei".
 *
 * É o que sobra quando o banco cai entre o envio e o segundo registro. A
 * carência deixa de fora o envio que ainda está acontecendo agora.
 *
 * Só leitura, e em duas consultas simples: as intenções da janela e os
 * desfechos do mesmo período; o cruzamento por `tentativaId` é feito aqui. O
 * volume é o de cliques do dono, então não precisa de filtro em JSON no banco.
 */
export async function listarEnviosSemDesfecho(
  opcoes: { organizationId?: string; desde?: Date; carenciaMs?: number; agora?: Date } = {},
): Promise<EnvioSemDesfecho[]> {
  const agora = opcoes.agora ?? new Date();
  const desde = opcoes.desde ?? new Date(agora.getTime() - 30 * DIA_MS);
  const ate = new Date(agora.getTime() - (opcoes.carenciaMs ?? 60_000));

  const intencoes = await prisma.operationsAuditEvent.findMany({
    where: {
      action: INTENCAO,
      createdAt: { gte: desde, lte: ate },
      ...(opcoes.organizationId ? { organizationId: opcoes.organizationId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (intencoes.length === 0) return [];

  // Sem filtro de cliente: recusado e erro antigos saíam sem `organizationId`.
  const desfechos = await prisma.operationsAuditEvent.findMany({
    where: { action: { in: DESFECHOS }, createdAt: { gte: desde } },
    select: { metadata: true },
  });
  const fechadas = new Set<string>();
  for (const { metadata } of desfechos) {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata.tentativaId != null) {
      fechadas.add(String(metadata.tentativaId));
    }
  }

  return intencoes
    .filter((intencao) => !fechadas.has(String(intencao.id)))
    .map((intencao) => ({
      tentativaId: String(intencao.id),
      iniciadoEm: intencao.createdAt,
      actorId: intencao.actorId,
      organizationId: intencao.organizationId,
      entityType: intencao.entityType,
      entityId: intencao.entityId,
      pedido: intencao.metadata,
    }));
}
