import type { ZodType } from "zod";
import type { ApprovalStore, TenantContext } from "./types";

export type ToolAccessLevel = "READ" | "WRITE";

export type ToolDefinition<TInput, TOutput> = {
  name: string;
  description: string;
  accessLevel: ToolAccessLevel;
  /** Ações WRITE que afetam sistemas externos exigem aprovação humana por padrão. */
  requiresApproval: boolean;
  inputSchema: ZodType<TInput>;
  /**
   * Chave de idempotência derivada do input — chamadas repetidas com a mesma
   * chave não devem repetir o efeito colateral no sistema de destino.
   */
  idempotencyKey: (input: TInput) => string;
  execute: (input: TInput, tenant: TenantContext) => Promise<TOutput>;
};

export class ToolNotAllowedError extends Error {
  constructor(toolName: string, agentId: string) {
    super(`Agente ${agentId} não tem permissão para usar a ferramenta ${toolName}`);
    this.name = "ToolNotAllowedError";
  }
}

export class ToolApprovalPendingError extends Error {
  constructor(public readonly approvalId: string, toolName: string) {
    super(`Ferramenta ${toolName} aguarda aprovação humana (id: ${approvalId})`);
    this.name = "ToolApprovalPendingError";
  }
}

export class ToolApprovalRejectedError extends Error {
  constructor(toolName: string) {
    super(`Ferramenta ${toolName} foi rejeitada na aprovação humana`);
    this.name = "ToolApprovalRejectedError";
  }
}

/**
 * Registro central de ferramentas por agente. Cada agente só pode chamar as
 * ferramentas que lhe foram explicitamente concedidas (least privilege) —
 * não existe ferramenta disponível por padrão para todos os agentes.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();
  private readonly grants = new Map<string, Set<string>>();
  private readonly seenIdempotencyKeys = new Set<string>();
  private readonly approvalIdByIdempotencyKey = new Map<string, string>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  grant(agentId: string, toolName: string): void {
    if (!this.grants.has(agentId)) this.grants.set(agentId, new Set());
    this.grants.get(agentId)!.add(toolName);
  }

  isGranted(agentId: string, toolName: string): boolean {
    return this.grants.get(agentId)?.has(toolName) ?? false;
  }

  /**
   * Executa uma ferramenta em nome de um agente/tenant. Lança erro se a
   * ferramenta não foi concedida ao agente. Se a ferramenta exige aprovação
   * humana, cria o pedido de aprovação e lança ToolApprovalPendingError —
   * quem chama deve tratar isso como "aguardando", não como falha definitiva.
   */
  async execute<TInput, TOutput>(
    toolName: string,
    rawInput: unknown,
    tenant: TenantContext,
    approvalStore?: ApprovalStore,
  ): Promise<TOutput> {
    const tool = this.tools.get(toolName) as ToolDefinition<TInput, TOutput> | undefined;
    if (!tool) {
      throw new Error(`Ferramenta não registrada: ${toolName}`);
    }
    if (!this.isGranted(tenant.agentId, toolName)) {
      throw new ToolNotAllowedError(toolName, tenant.agentId);
    }

    const input = tool.inputSchema.parse(rawInput);
    const idempotencyKey = `${tenant.projectId}:${toolName}:${tool.idempotencyKey(input)}`;

    if (this.seenIdempotencyKeys.has(idempotencyKey)) {
      throw new Error(`Ação já executada (idempotência): ${idempotencyKey}`);
    }

    if (tool.requiresApproval) {
      if (!approvalStore) {
        throw new Error(
          `Ferramenta ${toolName} exige aprovação humana, mas nenhum ApprovalStore foi fornecido`,
        );
      }

      let approvalId = this.approvalIdByIdempotencyKey.get(idempotencyKey);
      if (!approvalId) {
        const request = await approvalStore.create({
          tenant,
          toolName,
          summary: `Execução de ${toolName}`,
          payload: input,
        });
        approvalId = request.id;
        this.approvalIdByIdempotencyKey.set(idempotencyKey, approvalId);
      }

      const decision = await approvalStore.getDecision(approvalId);
      if (decision === null) {
        throw new ToolApprovalPendingError(approvalId, toolName);
      }
      if (decision === "REJECTED") {
        throw new ToolApprovalRejectedError(toolName);
      }
    }

    const result = await tool.execute(input, tenant);
    this.seenIdempotencyKeys.add(idempotencyKey);
    return result;
  }
}
