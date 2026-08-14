import crypto from "node:crypto";
import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStore,
  TenantContext,
} from "./types";

/**
 * Implementação em memória do ApprovalStore — útil para testes e para o
 * primeiro ambiente local antes de existir um adaptador Prisma. Não usar em
 * produção com múltiplas instâncias (estado não é compartilhado entre
 * processos).
 */
export class InMemoryApprovalStore implements ApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly decisions = new Map<string, ApprovalDecision>();

  async create(
    request: Omit<ApprovalRequest, "id" | "requestedAt">,
  ): Promise<ApprovalRequest> {
    const full: ApprovalRequest = {
      ...request,
      id: crypto.randomUUID(),
      requestedAt: new Date(),
    };
    this.requests.set(full.id, full);
    return full;
  }

  async getDecision(approvalId: string): Promise<ApprovalDecision | null> {
    return this.decisions.get(approvalId) ?? null;
  }

  /** Uso em testes/CLI: simula um humano aprovando ou rejeitando o pedido. */
  decide(approvalId: string, decision: ApprovalDecision): void {
    this.decisions.set(approvalId, decision);
  }

  listPending(tenant?: Pick<TenantContext, "organizationId">): ApprovalRequest[] {
    return [...this.requests.values()].filter(
      (request) =>
        !this.decisions.has(request.id) &&
        (!tenant || request.tenant.organizationId === tenant.organizationId),
    );
  }
}
