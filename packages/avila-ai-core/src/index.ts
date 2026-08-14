export {
  AiCoreClient,
  SpendLimitExceededError,
  estimateCostUsd,
  estimatePreCallCostUsd,
  MODEL_PRICING_USD_PER_1M,
} from "./client";
export type { AiCoreClientOptions, CompleteParams, CompleteResult } from "./client";

export { AiCoreStructuredClient, StructuredOutputValidationError } from "./structured";
export type {
  StructuredClientOptions,
  CompleteStructuredParams,
  CompleteStructuredResult,
} from "./structured";

export {
  ToolRegistry,
  ToolNotAllowedError,
  ToolApprovalPendingError,
  ToolApprovalRejectedError,
} from "./tools";
export type { ToolDefinition, ToolAccessLevel } from "./tools";

export { InMemoryApprovalStore } from "./approval";

export { runEvalSuite } from "./evals";
export type { EvalCase, EvalResult, EvalSummary } from "./evals";

export {
  redactForLogging,
  assertInputSize,
  InputTooLargeError,
  KillSwitchRegistry,
  KillSwitchActiveError,
  assertAllowedDestination,
} from "./security";

export { encryptSecret, decryptSecret, deriveKey } from "./crypto";

export type {
  TenantContext,
  CallSource,
  CallOutcome,
  TelemetryEvent,
  TelemetrySink,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalStore,
  KeyProvider,
  SpendLimitStatus,
  SpendGuard,
} from "./types";
