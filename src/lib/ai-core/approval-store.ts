import { Prisma } from "@prisma/client";
import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStore,
} from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Adaptador Prisma do ApprovalStore. A unicidade em
 * [projectId, toolName, idempotencyKey] no banco é a garantia real de que
 * duas solicitações idênticas resultam num único pedido de aprovação — não
 * dependemos só do cache em memória do ToolRegistry para isso.
 *
 * Pedidos pendentes que passam do prazo são tratados como EXPIRED na leitura
 * (getDecision), não apagados — mantém histórico auditável.
 */
export class PrismaApprovalStore implements ApprovalStore {
  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  async create(
    request: Omit<ApprovalRequest, "id" | "requestedAt">,
  ): Promise<ApprovalRequest> {
    const idempotencyKey = deriveIdempotencyKey(request.payload);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    const record = await prisma.aiCoreApproval.upsert({
      where: {
        projectId_toolName_idempotencyKey: {
          projectId: request.tenant.projectId,
          toolName: request.toolName,
          idempotencyKey,
        },
      },
      update: {},
      create: {
        organizationId: request.tenant.organizationId,
        projectId: request.tenant.projectId,
        agentId: request.tenant.agentId,
        actorId: request.tenant.actorId ?? null,
        toolName: request.toolName,
        idempotencyKey,
        summary: request.summary,
        payload: request.payload as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    return {
      id: record.id,
      tenant: request.tenant,
      toolName: record.toolName,
      summary: record.summary,
      payload: record.payload,
      requestedAt: record.createdAt,
    };
  }

  async getDecision(approvalId: string): Promise<ApprovalDecision | null> {
    const record = await prisma.aiCoreApproval.findUnique({ where: { id: approvalId } });
    if (!record) return null;

    if (record.status === "PENDING" && record.expiresAt < new Date()) {
      await prisma.aiCoreApproval.update({
        where: { id: approvalId },
        data: { status: "EXPIRED" },
      });
      return null;
    }

    if (record.status === "APPROVED" || record.status === "EXECUTED") return "APPROVED";
    if (record.status === "REJECTED") return "REJECTED";
    return null;
  }

  /**
   * Chamado pela UI de aprovação humana em /implantacao.
   *
   * O `where: { status: "PENDING" }` é a proteção real contra decisão
   * duplicada: updateMany() sobre uma condição que já deixou de ser
   * verdadeira simplesmente não atualiza nada (count: 0) — duas requisições
   * de decisão para o mesmo approvalId nunca conseguem as duas "vencer".
   * `rejectionReason` é exigido pelo chamador (rota de API) para REJECTED,
   * mas a validação de not-null aqui também impede um decide() direto sem
   * justificativa.
   */
  async decide(
    approvalId: string,
    decision: ApprovalDecision,
    decidedBy: string,
    rejectionReason?: string,
  ): Promise<{ applied: boolean }> {
    if (decision === "REJECTED" && !rejectionReason?.trim()) {
      throw new Error("Justificativa é obrigatória para rejeitar uma aprovação.");
    }

    const result = await prisma.aiCoreApproval.updateMany({
      where: { id: approvalId, status: "PENDING" },
      data: {
        status: decision,
        decidedBy,
        decidedAt: new Date(),
        rejectionReason: decision === "REJECTED" ? rejectionReason!.trim().slice(0, 500) : null,
      },
    });

    return { applied: result.count > 0 };
  }

  async markExecuted(approvalId: string): Promise<void> {
    await prisma.aiCoreApproval.updateMany({
      where: { id: approvalId, status: "APPROVED" },
      data: { status: "EXECUTED", executedAt: new Date() },
    });
  }
}

function deriveIdempotencyKey(payload: unknown): string {
  return JSON.stringify(payload, Object.keys(payload as object).sort());
}
