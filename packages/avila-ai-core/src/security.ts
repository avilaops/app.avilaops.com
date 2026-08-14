import type { TenantContext } from "./types";

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE_PATTERN = /\b(?:\+?55)?\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Remove padrões comuns de PII de um texto antes de ele ser gravado em log.
 * Não é DLP completo — é a primeira camada, suficiente para impedir que dado
 * sensível óbvio vaze para telemetria/observabilidade por descuido.
 */
export function redactForLogging(text: string): string {
  return text
    .replace(CPF_PATTERN, "[CPF_REDACTED]")
    .replace(CNPJ_PATTERN, "[CNPJ_REDACTED]")
    .replace(EMAIL_PATTERN, "[EMAIL_REDACTED]")
    .replace(CARD_PATTERN, "[CARD_REDACTED]")
    .replace(PHONE_PATTERN, "[PHONE_REDACTED]");
}

export class InputTooLargeError extends Error {
  constructor(actualLength: number, maxLength: number) {
    super(`Entrada com ${actualLength} caracteres excede o limite de ${maxLength}`);
    this.name = "InputTooLargeError";
  }
}

export function assertInputSize(input: string, maxLength = 32_000): void {
  if (input.length > maxLength) {
    throw new InputTooLargeError(input.length, maxLength);
  }
}

export class KillSwitchActiveError extends Error {
  constructor(scope: string) {
    super(`Kill switch ativo para: ${scope}`);
    this.name = "KillSwitchActiveError";
  }
}

/**
 * Kill switch em memória, por processo. Serve para desligar um agente ou
 * projeto imediatamente sem precisar de deploy. Para múltiplas instâncias em
 * produção, o app consumidor deve persistir esse estado (ex.: coluna no
 * banco checada antes de cada chamada) — este módulo cobre o caso simples de
 * uma instância e serve de contrato para o caso distribuído.
 */
export class KillSwitchRegistry {
  private readonly blockedAgents = new Set<string>();
  private readonly blockedProjects = new Set<string>();

  blockAgent(agentId: string): void {
    this.blockedAgents.add(agentId);
  }

  blockProject(projectId: string): void {
    this.blockedProjects.add(projectId);
  }

  unblockAgent(agentId: string): void {
    this.blockedAgents.delete(agentId);
  }

  unblockProject(projectId: string): void {
    this.blockedProjects.delete(projectId);
  }

  assertAllowed(tenant: TenantContext): void {
    if (this.blockedAgents.has(tenant.agentId)) {
      throw new KillSwitchActiveError(`agent:${tenant.agentId}`);
    }
    if (this.blockedProjects.has(tenant.projectId)) {
      throw new KillSwitchActiveError(`project:${tenant.projectId}`);
    }
  }
}

/** Lista de destinos/domínios que uma ferramenta pode acessar — allowlist explícita. */
export function assertAllowedDestination(url: string, allowlist: string[]): void {
  const { hostname } = new URL(url);
  const allowed = allowlist.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!allowed) {
    throw new Error(`Destino não permitido: ${hostname}`);
  }
}
