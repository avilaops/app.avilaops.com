export type CallSource = "PRODUCTION" | "TEST";

/**
 * Identifica quem está fazendo a chamada: organização (tenant), projeto dentro dela,
 * e o agente/feature responsável. Toda chamada ao Core exige um contexto completo —
 * não existe chamada "anônima", porque telemetria e custo por tenant dependem disso.
 *
 * `source` marca chamadas de teste/smoke test (deploy, validação manual) para
 * que fiquem auditáveis mas NUNCA contem em métricas comerciais ou consumam
 * orçamento real — todo adaptador que lê telemetria/gasto para relatórios
 * comerciais deve filtrar source="PRODUCTION". Padrão: "PRODUCTION".
 */
export type TenantContext = {
  organizationId: string;
  projectId: string;
  agentId: string;
  actorId?: string | null;
  source?: CallSource;
};

export type CallOutcome = "SUCCESS" | "ERROR" | "BLOCKED";

export type TelemetryEvent = {
  tenant: TenantContext;
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  outcome: CallOutcome;
  errorMessage?: string | null;
  toolsInvoked?: string[];
  createdAt: Date;
};

/** O app consumidor implementa isso para persistir telemetria (ex.: via Prisma). */
export interface TelemetrySink {
  record(event: TelemetryEvent): Promise<void>;
}

export type ApprovalRequest = {
  id: string;
  tenant: TenantContext;
  toolName: string;
  summary: string;
  payload: unknown;
  requestedAt: Date;
};

export type ApprovalDecision = "APPROVED" | "REJECTED";

/** O app consumidor implementa isso para persistir e consultar aprovações pendentes. */
export interface ApprovalStore {
  create(request: Omit<ApprovalRequest, "id" | "requestedAt">): Promise<ApprovalRequest>;
  getDecision(approvalId: string): Promise<ApprovalDecision | null>;
}

/** O app consumidor implementa isso para entregar a chave OpenAI correta por tenant/projeto. */
export interface KeyProvider {
  getApiKey(tenant: TenantContext): Promise<string>;
}

export type SpendLimitStatus = {
  limitUsd: number;
  spentUsd: number;
  blocked: boolean;
  /** Identificador da reserva, para confirmar ou liberar depois. Ausente quando blocked=true ou sem política cadastrada. */
  reservationId?: string;
};

/**
 * Ciclo de vida completo de uma reserva de gasto:
 *
 * 1. reserve(tenant, requestId, estimatedCostUsd) — antes da chamada à OpenAI,
 *    com o custo ESTIMADO. Retorna reservationId em status.reservationId
 *    quando não bloqueado.
 * 2. confirm(reservationId, actualCostUsd) — depois de uma resposta bem-sucedida,
 *    com o custo REAL medido (tokens reais). Ajusta a diferença entre
 *    estimado e real no gasto acumulado da política.
 * 3. release(reservationId) — se a chamada falhar antes de haver um custo
 *    real (erro de rede, timeout, etc.), libera a reserva por completo —
 *    o gasto estimado nunca chega a contar no acumulado.
 *
 * Uma reserva que não recebe confirm() nem release() (processo interrompido
 * entre os passos) fica "presa" em RESERVED — releaseStaleReservations()
 * varre e libera essas reservas órfãs após um tempo máximo.
 */
export interface SpendGuard {
  reserve(
    tenant: TenantContext,
    requestId: string,
    estimatedCostUsd: number,
  ): Promise<SpendLimitStatus>;
  confirm(reservationId: string, actualCostUsd: number): Promise<void>;
  release(reservationId: string): Promise<void>;
  /** Libera reservas RESERVED há mais que maxAgeMs. Retorna quantas foram liberadas. */
  releaseStaleReservations(maxAgeMs: number): Promise<number>;
}
