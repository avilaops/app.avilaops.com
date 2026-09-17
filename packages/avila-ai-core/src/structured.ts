import crypto from "node:crypto";
import OpenAI from "openai";
import type { ZodType } from "zod";
// zodToJsonSchema tem uma assinatura genérica que, combinada com o ZodType<T>
// genérico usado aqui, faz o compilador do Next.js (com todo o projeto
// carregado) reportar "Type instantiation is excessively deep and possibly
// infinite" — mesmo com skipLibCheck. A validação de tipo real acontece via
// schema.safeParse() logo abaixo; este helper só evita a explosão de tipo.
import { zodToJsonSchema as zodToJsonSchemaUntyped } from "zod-to-json-schema";
function zodToJsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  return zodToJsonSchemaUntyped(schema as never) as Record<string, unknown>;
}
import { assertInputSize, KillSwitchRegistry } from "./security";
import { estimateCostUsd, estimatePreCallCostUsd, SpendLimitExceededError } from "./client";
import type {
  KeyProvider,
  SpendGuard,
  TelemetrySink,
  TenantContext,
} from "./types";

export { SpendLimitExceededError };

export class StructuredOutputValidationError extends Error {
  constructor(public readonly issues: string) {
    super(`Saída do modelo não corresponde ao schema esperado: ${issues}`);
    this.name = "StructuredOutputValidationError";
  }
}

export type CompleteStructuredParams<T> = {
  tenant: TenantContext;
  model: string;
  input: string;
  instructions?: string;
  schema: ZodType<T>;
  schemaName: string;
  /**
   * JSON Schema já convertido. Quando ausente, o schema zod é convertido
   * aqui — o que só funciona com a major do zod deste pacote (3.x).
   * Consumidor em outra major (o app usa a 4.x, cuja árvore interna o
   * zod-to-json-schema não entende) converte com a própria e passa o
   * resultado por aqui; a validação em tempo de execução continua sendo o
   * safeParse do schema recebido, idêntico nas duas majors.
   */
  jsonSchema?: Record<string, unknown>;
};

export type CompleteStructuredResult<T> = {
  requestId: string;
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
};

export type StructuredClientOptions = {
  keyProvider: KeyProvider;
  telemetrySink: TelemetrySink;
  spendGuard?: SpendGuard;
  killSwitch?: KillSwitchRegistry;
  timeoutMs?: number;
  maxInputLength?: number;
  /** Injeção de fetch customizado — usado em testes para não bater na rede real. */
  fetch?: OpenAI["fetch"];
};

/**
 * Variante do AiCoreClient para respostas que alimentam outro sistema (não
 * texto livre para exibir a um usuário). Usa Structured Outputs com
 * strict: true e valida a saída contra o schema Zod antes de devolver —
 * erro explícito em vez de deixar um JSON malformado seguir adiante.
 */
export class AiCoreStructuredClient {
  private readonly keyProvider: KeyProvider;
  private readonly telemetrySink: TelemetrySink;
  private readonly spendGuard?: SpendGuard;
  private readonly killSwitch: KillSwitchRegistry;
  private readonly timeoutMs: number;
  private readonly maxInputLength: number;
  private readonly fetchImpl?: OpenAI["fetch"];

  constructor(options: StructuredClientOptions) {
    this.keyProvider = options.keyProvider;
    this.telemetrySink = options.telemetrySink;
    this.spendGuard = options.spendGuard;
    this.killSwitch = options.killSwitch ?? new KillSwitchRegistry();
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxInputLength = options.maxInputLength ?? 32_000;
    this.fetchImpl = options.fetch;
  }

  async complete<T>(params: CompleteStructuredParams<T>): Promise<CompleteStructuredResult<T>> {
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
        await this.telemetrySink
          .record({
            tenant: params.tenant,
            requestId,
            model: params.model,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            latencyMs,
            outcome: "BLOCKED",
            createdAt: new Date(),
          })
          .catch(() => {});
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
        text: {
          format: {
            type: "json_schema",
            name: params.schemaName,
            strict: true,
            schema: params.jsonSchema ?? zodToJsonSchema(params.schema),
          },
        },
      });

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const actualCostUsd = estimateCostUsd(params.model, inputTokens, outputTokens);
      const latencyMs = Date.now() - startedAt;

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(response.output_text ?? "{}");
      } catch {
        throw new StructuredOutputValidationError("resposta não é um JSON válido");
      }

      const validation = params.schema.safeParse(parsedJson);
      if (!validation.success) {
        throw new StructuredOutputValidationError(validation.error.message);
      }

      if (this.spendGuard && reservationId) {
        await this.spendGuard.confirm(reservationId, actualCostUsd);
      }

      await this.telemetrySink.record({
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
        data: validation.data,
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

      await this.telemetrySink
        .record({
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
        })
        .catch(() => {});

      throw error;
    }
  }
}
