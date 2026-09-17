import { z } from "zod";

/**
 * Contrato da tela Saúde em tempo real.
 *
 * Regra do contrato: nenhum número chega à tela sem origem, horário e estado
 * de confiabilidade. Um `HealthMeasurement` sem `source` ou sem
 * `observedAt`/`reliability` não passa no parse, e a API responde 500 em vez de
 * mostrar um valor sem evidência.
 */

export const reliabilityStates = ["live", "stale", "missing", "estimated", "cache", "fallback", "mock"] as const;

export const sourceSchema = z.object({
  /** host-agent: script no servidor; http-probe: teste de URL feito pelo app; derived: cálculo sobre outras medições. */
  type: z.enum(["host-agent", "http-probe", "derived"]),
  /** Apelido do servidor que originou o dado (applications, apps-noclient) ou null se derivado. */
  server: z.string().nullable(),
  host: z.string().nullable(),
  collector: z.string().min(1),
  collectorVersion: z.string().nullable(),
  /** Nome da métrica original, como o coletor a lê. */
  metric: z.string().min(1),
  /** Por onde o dado entrou no backend. */
  endpoint: z.string().min(1),
});

export const calculationSchema = z.object({
  type: z.enum(["raw", "formula", "classification", "aggregate"]),
  formula: z.string().min(1),
  /** Arquivo e função que fazem o cálculo. */
  code: z.string().min(1),
  version: z.string().min(1),
});

export const reliabilitySchema = z.object({
  state: z.enum(reliabilityStates),
  stale: z.boolean(),
  ageMs: z.number().nonnegative().nullable(),
  staleAfterMs: z.number().positive(),
  note: z.string().nullable(),
});

const isoDate = z.string().datetime({ offset: true });

export function measurementSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    unit: z.string().nullable(),
    status: z.string().nullable(),
    /** Quando a medição aconteceu na origem. Null só se a origem não informa, e aí `reliability.state` é "estimated". */
    observedAt: isoDate.nullable(),
    /** Quando chegou ao backend. */
    receivedAt: isoDate.nullable(),
    /** Quando foi gravada no banco. */
    persistedAt: isoDate.nullable(),
    source: sourceSchema,
    calculation: calculationSchema,
    reliability: reliabilitySchema,
    /** Valores brutos que sustentam o número exibido. */
    raw: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    transport: z.array(z.string()).min(1),
  });
}

export const numberMeasurement = measurementSchema(z.number());
export const nullableNumberMeasurement = measurementSchema(z.number().nullable());
export const statusMeasurement = measurementSchema(z.enum(["HEALTHY", "SLOW", "DOWN", "UNKNOWN"]));

export type HealthMeasurement<T> = Omit<z.infer<typeof numberMeasurement>, "value"> & { value: T };

const historyPointSchema = z.object({
  at: isoDate,
  status: z.string(),
  latencyMs: z.number().nullable(),
  httpStatus: z.number().nullable(),
  errorCode: z.string().nullable(),
});

export const serviceSchema = z.object({
  key: z.string(),
  name: z.string(),
  declaredServer: z.string(),
  declaredServerAlias: z.string(),
  url: z.string(),
  method: z.literal("GET"),
  status: statusMeasurement,
  latency: nullableNumberMeasurement,
  check: z.object({
    id: z.string().nullable(),
    requestId: z.string().nullable(),
    trigger: z.string().nullable(),
    probeServer: z.string().nullable(),
    probeVersion: z.string().nullable(),
    httpStatus: z.number().nullable(),
    errorCode: z.string().nullable(),
    errorCategory: z.string().nullable(),
    errorMessage: z.string().nullable(),
    finalUrl: z.string().nullable(),
    redirects: z.number().nullable(),
    resolvedIp: z.string().nullable(),
    hosting: z.object({ kind: z.string(), detail: z.string(), serverKey: z.string().optional() }),
    hostname: z.string(),
    timings: z.object({ dnsMs: z.number().nullable(), connectMs: z.number().nullable(), tlsMs: z.number().nullable(), ttfbMs: z.number().nullable() }),
    checkedAt: isoDate.nullable(),
    finishedAt: isoDate.nullable(),
  }),
  history: z.array(historyPointSchema),
});

export const serverSchema = z.object({
  key: z.string(),
  alias: z.string(),
  name: z.string(),
  ip: z.string(),
  hostname: z.string().nullable(),
  snapshotId: z.string(),
  requestId: z.string().nullable(),
  cpu: numberMeasurement,
  memory: numberMeasurement,
  memoryAvailableMb: numberMeasurement,
  swap: numberMeasurement,
  disk: numberMeasurement,
  load1: numberMeasurement,
  containers: z.object({
    running: numberMeasurement,
    unhealthy: numberMeasurement,
    total: nullableNumberMeasurement,
    stopped: nullableNumberMeasurement,
  }),
});

export const summarySchema = z.object({
  healthy: numberMeasurement,
  slow: numberMeasurement,
  down: numberMeasurement,
  unknown: numberMeasurement,
  averageLatency: nullableNumberMeasurement,
});

export const snapshotSchema = z.object({
  meta: z.object({
    requestId: z.string().min(1),
    endpoint: z.string(),
    generatedAt: isoDate,
    durationMs: z.number().nonnegative(),
    collection: z.object({
      mode: z.enum(["collected", "reused", "read-only"]),
      lastRoundAt: isoDate.nullable(),
      note: z.string(),
    }),
    backend: z.object({ commit: z.string(), builtAt: z.string(), rulesVersion: z.string(), probeVersion: z.string() }),
    thresholds: z.object({
      collectIntervalMs: z.number(), staleAfterMs: z.number(), slowThresholdMs: z.number(),
      probeTimeoutMs: z.number(), historyWindowMs: z.number(), retentionMs: z.number(),
    }),
  }),
  summary: summarySchema,
  servers: z.array(serverSchema),
  services: z.array(serviceSchema),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type ServiceView = z.infer<typeof serviceSchema>;
export type ServerView = z.infer<typeof serverSchema>;
export type AnyMeasurement = z.infer<typeof nullableNumberMeasurement> | z.infer<typeof statusMeasurement> | z.infer<typeof numberMeasurement>;

/**
 * Valida a resposta antes de sair. Em produção, qualquer medição marcada
 * como "mock" derruba a resposta: mock não entra calado na tela real.
 */
export function assertSnapshot(data: unknown, env: string | undefined = process.env.NODE_ENV): Snapshot {
  const snapshot = snapshotSchema.parse(data);
  if (env === "production") {
    const mocks: string[] = [];
    const check = (label: string, m: { reliability: { state: string } }) => {
      if (m.reliability.state === "mock") mocks.push(label);
    };
    Object.entries(snapshot.summary).forEach(([k, m]) => check(`summary.${k}`, m));
    snapshot.services.forEach((s) => { check(`${s.key}.status`, s.status); check(`${s.key}.latency`, s.latency); });
    snapshot.servers.forEach((s) => {
      [s.cpu, s.memory, s.memoryAvailableMb, s.swap, s.disk, s.load1, s.containers.running, s.containers.unhealthy, s.containers.total, s.containers.stopped]
        .forEach((m, i) => check(`${s.key}.${i}`, m));
    });
    if (mocks.length) throw new Error(`Medição simulada em produção: ${mocks.join(", ")}`);
  }
  return snapshot;
}

/** Corpo que o coletor do host envia. Campos novos opcionais: coletor antigo continua aceito, marcado como estimado. */
export const serverIngestSchema = z.object({
  serverKey: z.string().min(1).max(40),
  serverName: z.string().min(1).max(80),
  cpuPercent: z.number().min(0).max(100),
  memoryUsedPercent: z.number().min(0).max(100),
  memoryAvailableMb: z.number().min(0).max(1_000_000),
  swapUsedPercent: z.number().min(0).max(100),
  diskUsedPercent: z.number().min(0).max(100),
  load1: z.number().min(0).max(10_000),
  containersRunning: z.number().int().min(0).max(100_000),
  containersUnhealthy: z.number().int().min(0).max(100_000),
  containersTotal: z.number().int().min(0).max(100_000).optional(),
  containersStopped: z.number().int().min(0).max(100_000).optional(),
  observedAt: isoDate.optional(),
  collectorVersion: z.string().max(60).optional(),
  hostname: z.string().max(120).optional(),
  requestId: z.string().max(80).optional(),
  raw: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
});

export type ServerIngest = z.infer<typeof serverIngestSchema>;

const SECRET_KEY = /token|secret|senha|password|authorization|cookie|api[-_]?key|bearer/i;

/** Tira segredos de qualquer JSON antes de mostrar no modo de inspeção. */
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[removido]" : sanitize(v)]),
    );
  }
  if (typeof value === "string" && /^Bearer\s+/i.test(value)) return "[removido]";
  return value;
}
