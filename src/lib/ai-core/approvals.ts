import { redactForLogging } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";

export type ApprovalListItem = {
  id: string;
  organizationId: string;
  projectId: string;
  agentId: string;
  toolName: string;
  summary: string;
  /** Payload já redigido de PII — seguro para renderizar direto na UI. */
  payloadPreview: string;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  expiresAt: Date;
  isExpired: boolean;
  createdAt: Date;
};

function redactPayload(payload: unknown): string {
  const json = JSON.stringify(payload, null, 2);
  return redactForLogging(json).slice(0, 2000);
}

/**
 * Lista aprovações para exibição na UI de /implantacao. Sempre requer um
 * organizationId — não existe "listar todas as aprovações de todas as
 * organizações" nesta função, propositalmente, para que nenhuma tela nova
 * possa vazar aprovações entre tenants por esquecer o filtro.
 */
export async function listApprovalsForOrganization(
  organizationId: string,
  status?: string,
): Promise<ApprovalListItem[]> {
  const records = await prisma.aiCoreApproval.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const now = new Date();
  return records.map((record) => ({
    id: record.id,
    organizationId: record.organizationId,
    projectId: record.projectId,
    agentId: record.agentId,
    toolName: record.toolName,
    summary: redactForLogging(record.summary),
    payloadPreview: redactPayload(record.payload),
    status: record.status,
    decidedBy: record.decidedBy,
    decidedAt: record.decidedAt,
    rejectionReason: record.rejectionReason,
    expiresAt: record.expiresAt,
    isExpired: record.status === "PENDING" && record.expiresAt < now,
    createdAt: record.createdAt,
  }));
}
