import {
  CLOUDFLARE_V4,
  CLOUDFLARE_V6_PREFIXES,
  SERVERS,
  SLOW_THRESHOLD_MS,
  STALE_AFTER_MS,
  type ServerKey,
} from "@/lib/health/config";

/**
 * Toda regra que transforma leitura em status, total ou frescor.
 *
 * Funções puras de propósito: os testes em `tests/unit/health-*.test.ts`
 * provam cada regra sem banco nem rede, e o painel "Detalhes da medição"
 * mostra o mesmo texto de regra que o código aplica.
 */

export type ProbeStatus = "HEALTHY" | "SLOW" | "DOWN";
export type DisplayStatus = ProbeStatus | "UNKNOWN";
export type ErrorCategory = "TLS" | "DNS" | "TIMEOUT" | "CONNECTION" | "HTTP" | "OTHER";

export type ProbeOutcome = {
  httpStatus: number | null;
  latencyMs: number | null;
  errorCode: string | null;
};

export const STATUS_RULES = {
  HEALTHY: `resposta HTTP 2xx em até ${SLOW_THRESHOLD_MS} ms`,
  SLOW: `resposta HTTP 2xx acima de ${SLOW_THRESHOLD_MS} ms`,
  DOWN: "erro de rede, DNS, TLS, timeout ou HTTP fora de 2xx",
  UNKNOWN: `sem leitura, ou última leitura com mais de ${STALE_AFTER_MS / 1000} s`,
} as const;

export function classifyProbe(outcome: ProbeOutcome): { status: ProbeStatus; reason: string } {
  if (outcome.errorCode) return { status: "DOWN", reason: `erro ${outcome.errorCode}` };
  if (outcome.httpStatus === null) return { status: "DOWN", reason: "sem resposta HTTP" };
  if (outcome.httpStatus < 200 || outcome.httpStatus > 299) {
    return { status: "DOWN", reason: `HTTP ${outcome.httpStatus} fora de 2xx` };
  }
  if (outcome.latencyMs !== null && outcome.latencyMs > SLOW_THRESHOLD_MS) {
    return { status: "SLOW", reason: `HTTP ${outcome.httpStatus} em ${outcome.latencyMs} ms (> ${SLOW_THRESHOLD_MS} ms)` };
  }
  return { status: "HEALTHY", reason: `HTTP ${outcome.httpStatus} em ${outcome.latencyMs ?? "?"} ms` };
}

/** Categoria do erro técnico. O código original nunca é trocado, só classificado. */
export function errorCategory(code: string | null, httpStatus: number | null = null): ErrorCategory | null {
  if (!code) return httpStatus !== null && (httpStatus < 200 || httpStatus > 299) ? "HTTP" : null;
  if (/CERT|SIGNATURE|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|HOSTNAME_MISMATCH/i.test(code)) return "TLS";
  if (/ENOTFOUND|EAI_AGAIN|ENODATA|DNS/i.test(code)) return "DNS";
  if (/TIMEOUT|ETIMEDOUT|ABORT/i.test(code)) return "TIMEOUT";
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|SOCKET|UND_ERR/i.test(code)) return "CONNECTION";
  if (/^HTTP_/i.test(code)) return "HTTP";
  return "OTHER";
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const ipValue = ipv4ToInt(ip);
  const baseValue = ipv4ToInt(base);
  const bits = Number(bitsText);
  if (ipValue === null || baseValue === null || !Number.isInteger(bits)) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(ipValue / size) === Math.floor(baseValue / size);
}

export type Hosting =
  | { kind: "server"; serverKey: ServerKey; detail: string }
  | { kind: "cloudflare"; detail: string }
  | { kind: "external"; detail: string }
  | { kind: "unresolved"; detail: string };

/** Onde o DNS diz que o serviço está, a partir do IP que o probe resolveu. */
export function hostingOf(ip: string | null): Hosting {
  if (!ip) return { kind: "unresolved", detail: "o probe não resolveu IP" };
  for (const server of Object.values(SERVERS)) {
    if (server.ip === ip) return { kind: "server", serverKey: server.key, detail: `${ip} é o ${server.alias}` };
  }
  const lower = ip.toLowerCase();
  if (CLOUDFLARE_V4.some((cidr) => ipInCidr(ip, cidr)) || CLOUDFLARE_V6_PREFIXES.some((p) => lower.startsWith(p))) {
    return { kind: "cloudflare", detail: `${ip} é da Cloudflare (proxy): a origem não é comprovável pelo DNS` };
  }
  return { kind: "external", detail: `${ip} não pertence a nenhum servidor da Avila Ops` };
}

export type Freshness = { state: "live" | "stale" | "missing"; ageMs: number | null; staleAfterMs: number };

/** Frescor medido pela hora da medição, nunca pela hora do fetch da tela. */
export function freshness(observedAt: string | Date | null, nowMs: number, staleAfterMs = STALE_AFTER_MS): Freshness {
  if (!observedAt) return { state: "missing", ageMs: null, staleAfterMs };
  const ageMs = Math.max(0, nowMs - new Date(observedAt).getTime());
  return { state: ageMs > staleAfterMs ? "stale" : "live", ageMs, staleAfterMs };
}

export type SummaryInput = {
  key: string;
  status: DisplayStatus;
  latencyMs: number | null;
  checkedAt: string | null;
};

export type Summary = {
  healthy: number;
  slow: number;
  down: number;
  unknown: number;
  total: number;
  average: {
    valueMs: number | null;
    method: "média simples";
    includedKeys: string[];
    excluded: { key: string; reason: string }[];
    rule: string;
  };
  keys: { healthy: string[]; slow: string[]; down: string[]; unknown: string[] };
  rules: typeof STATUS_RULES;
};

/**
 * Os quatro números do cabeçalho.
 *
 * - Cada serviço entra em exatamente um grupo, pela última leitura.
 * - Leitura desatualizada (ou ausente) vai para `unknown`, qualquer que fosse
 *   o status: um "saudável" de dez minutos atrás não é saudável agora.
 * - Resposta média: média simples da última latência dos serviços com leitura
 *   atual e status HEALTHY ou SLOW. DOWN fica fora porque a "latência" de uma
 *   falha é o tempo até o erro (um handshake TLS recusado, um timeout de 8 s),
 *   não tempo de resposta.
 */
export function summarize(services: SummaryInput[], nowMs: number, staleAfterMs = STALE_AFTER_MS): Summary {
  const keys = { healthy: [] as string[], slow: [] as string[], down: [] as string[], unknown: [] as string[] };
  const includedKeys: string[] = [];
  const excluded: { key: string; reason: string }[] = [];
  let sum = 0;

  for (const service of services) {
    const fresh = freshness(service.checkedAt, nowMs, staleAfterMs);
    const effective: DisplayStatus = fresh.state === "live" ? service.status : "UNKNOWN";
    if (effective === "HEALTHY") keys.healthy.push(service.key);
    else if (effective === "SLOW") keys.slow.push(service.key);
    else if (effective === "DOWN") keys.down.push(service.key);
    else keys.unknown.push(service.key);

    if (effective === "DOWN") excluded.push({ key: service.key, reason: "fora do ar: o tempo medido é até o erro" });
    else if (effective === "UNKNOWN") excluded.push({ key: service.key, reason: fresh.state === "missing" ? "sem leitura" : "leitura desatualizada" });
    else if (service.latencyMs === null) excluded.push({ key: service.key, reason: "sem latência registrada" });
    else {
      includedKeys.push(service.key);
      sum += service.latencyMs;
    }
  }

  return {
    healthy: keys.healthy.length,
    slow: keys.slow.length,
    down: keys.down.length,
    unknown: keys.unknown.length,
    total: services.length,
    average: {
      valueMs: includedKeys.length ? Math.round(sum / includedKeys.length) : null,
      method: "média simples",
      includedKeys,
      excluded,
      rule: "média simples da última latência de cada serviço com leitura atual e status HEALTHY ou SLOW; DOWN e desatualizados ficam fora",
    },
    keys,
    rules: STATUS_RULES,
  };
}

export type HistoryPoint = { status: string; checkedAt: string | Date };

/** Falhas seguidas, última falha e última recuperação a partir do histórico (em ordem crescente). */
export function analyzeHistory(points: HistoryPoint[]) {
  let consecutiveFailures = 0;
  for (let i = points.length - 1; i >= 0 && points[i].status === "DOWN"; i -= 1) consecutiveFailures += 1;

  let lastFailureAt: string | null = null;
  let lastRecoveryAt: string | null = null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (!lastFailureAt && point.status === "DOWN") lastFailureAt = new Date(point.checkedAt).toISOString();
    if (!lastRecoveryAt && point.status !== "DOWN" && i > 0 && points[i - 1].status === "DOWN") {
      lastRecoveryAt = new Date(point.checkedAt).toISOString();
    }
    if (lastFailureAt && lastRecoveryAt) break;
  }
  const failingSince = consecutiveFailures
    ? new Date(points[points.length - consecutiveFailures].checkedAt).toISOString()
    : null;
  return { consecutiveFailures, lastFailureAt, lastRecoveryAt, failingSince, checksAnalyzed: points.length };
}

export function capacityLevel(value: number, limits: { warning: number; critical: number }) {
  return value >= limits.critical ? "danger" : value >= limits.warning ? "warning" : "good";
}
