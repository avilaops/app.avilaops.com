import crypto from "node:crypto";
import OpenAI from "openai";
import { assertInputSize, KillSwitchRegistry } from "./security";
import type {
  KeyProvider,
  SpendGuard,
  TelemetryEvent,
  TelemetrySink,
  TenantContext,
} from "./types";

/**
 * Tabela de preço própria, em USD por 1M tokens — não hardcoded na lógica de
 * chamada, e não lida direto do provedor. Atualizar aqui quando a OpenAI
 * mudar preços; a fonte de verdade fica isolada num único lugar.
 */
export const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING_USD_PER_1M[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/**
 * Estimativa conservadora usada para a RESERVA, antes de a chamada existir
 * (não sabemos ainda os tokens reais de entrada/saída). Usa ~4 caracteres
 * por token para o input, e assume uma saída até 4x maior que o input como
 * teto superior plausível — intencionalmente generoso, para a reserva nunca
 * ficar pequena demais e permitir estouro de orçamento por chamadas caras.
 */
export function estimatePreCallCostUsd(model: string, inputText: string): number {
  const estimatedInputTokens = Math.ceil(inputText.length / 4);
  const estimatedOutputTokens = estimatedInputTokens * 4;
  return estimateCostUsd(model, estimatedInputTokens, estimatedOutputTokens);
}

export class SpendLimitExceededError extends Error {
  constructor(tenant: TenantContext) {
    super(`Limite de gasto atingido para o projeto ${tenant.projectId}`);
    this.name = "SpendLimitExceededError";
  }
}

export type AiCoreClientOptions = {
  keyProvider: KeyProvider;
  telemetrySink: TelemetrySink;
  spendGuard?: SpendGuard;
  killSwitch?: KillSwitchRegistry;
  /** Timeout por chamada, em ms. O SDK oficial já trata retry/backoff internamente. */
  timeoutMs?: number;
  maxInputLength?: number;
  /** Injeção de fetch customizado — usado em testes para não bater na rede real. */
  fetch?: OpenAI["fetch"];
};

export type CompleteParams = {
  tenant: TenantContext;
  model: string;
  input: string;
  instructions?: string;
};

export type CompleteResult = {
  requestId: string;
  outputText: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
};

/**
 * Cliente OpenAI seguro para uso exclusivamente no backend. Nunca deve ser
 * importado por código que roda no navegador — a chave é resolvida por
 * tenant/projeto via KeyProvider e nunca sai do processo do servidor.
 */
export class AiCoreClient {
  private readonly keyProvider: KeyProvider;
  private readonly telemetrySink: TelemetrySink;
  private readonly spendGuard?: SpendGuard;
  private readonly killSwitch: KillSwitchRegistry;
  private readonly timeoutMs: number;
  private readonly maxInputLength: number;
  private readonly fetchImpl?: OpenAI["fetch"];

  constructor(options: AiCoreClientOptions) {
    this.keyProvider = options.keyProvider;
    this.telemetrySink = options.telemetrySink;
    this.spendGuard = options.spendGuard;
    this.killSwitch = options.killSwitch ?? new KillSwitchRegistry();
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxInputLength = options.maxInputLength ?? 32_000;
    this.fetchImpl = options.fetch;
  }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();

    this.killSwitch.assertAllowed(params.tenant);
    assertInputSize(params.input, this.maxInputLength);

    let reservationId: string | undefined;
    if (this.spendGuard) {
      const preCallEstimate = estimatePreCallCostUsd(params.model, params.input);
      const status = await this.spendGuard.reserve(params.tenant, requestId, preCallEstimate);
      if (status.blocked) {
        const latencyMs = Date.now() - startedAt;
        await this.recordTelemetry({
          tenant: params.tenant,
          requestId,
          model: params.model,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          latencyMs,
          outcome: "BLOCKED",
          createdAt: new Date(),
        });
        throw new SpendLimitExceededError(params.tenant);
      }
      reservationId = status.reservationId;
    }

    const apiKey = await this.keyProvider.getApiKey(params.tenant);
    const client = new OpenAI({ apiKey, timeout: this.timeoutMs, fetch: this.fetchImpl });

    try {
      const response = await client.responses.create({
        model: params.model,
        input: params.input,
        instructions: params.instructions,
      });

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const actualCostUsd = estimateCostUsd(params.model, inputTokens, outputTokens);

      if (this.spendGuard && reservationId) {
        await this.spendGuard.confirm(reservationId, actualCostUsd);
      }

      const latencyMs = Date.now() - startedAt;

      await this.recordTelemetry({
        tenant: params.tenant,
        requestId,
        model: params.model,
        inputTokens,
        outputTokens,
        estimatedCostUsd: actualCostUsd,
        latencyMs,
        outcome: "SUCCESS",
        createdAt: new Date(),
      });

      return {
        requestId,
        outputText: response.output_text ?? "",
        model: params.model,
        inputTokens,
        outputTokens,
        estimatedCostUsd: actualCostUsd,
        latencyMs,
      };
    } catch (error) {
      if (this.spendGuard && reservationId) {
        await this.spendGuard.release(reservationId).catch(() => {});
      }

      const latencyMs = Date.now() - startedAt;
      const errorMessage = error instanceof Error ? error.message : "Falha desconhecida";

      await this.recordTelemetry({
        tenant: params.tenant,
        requestId,
        model: params.model,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        outcome: "ERROR",
        errorMessage,
        createdAt: new Date(),
      });

      throw error;
    }
  }

  private async recordTelemetry(event: TelemetryEvent): Promise<void> {
    try {
      await this.telemetrySink.record(event);
    } catch {
      // Falha ao gravar telemetria nunca deve derrubar a chamada original.
    }
  }
}
