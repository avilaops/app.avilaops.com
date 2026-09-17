import {
  analyzeHistory,
  classifyProbe,
  errorCategory,
  freshness,
  hostingOf,
  STATUS_RULES,
  summarize,
  type DisplayStatus,
} from "@/lib/health/classify";
import {
  COLLECT_INTERVAL_MS,
  HEALTH_RULES_VERSION,
  HISTORY_POINTS,
  HISTORY_WINDOW_MS,
  MONITORED_SERVICES,
  PROBE_TIMEOUT_MS,
  PROBE_VERSION,
  RETENTION_MS,
  SERVERS,
  SLOW_THRESHOLD_MS,
  STALE_AFTER_MS,
  type ServerKey,
} from "@/lib/health/config";
import type { HealthMeasurement, Snapshot } from "@/lib/health/schemas";

/**
 * Monta a resposta da tela a partir das linhas do banco.
 *
 * Pura (sem Prisma, sem relógio próprio): recebe as linhas e o "agora" e
 * devolve cada número já com origem, horários, fórmula, dados brutos e
 * frescor. É o que os testes usam para provar que a proveniência chega à tela.
 */

export type CheckRow = {
  id: bigint | number | string;
  serviceKey: string;
  url: string;
  status: string;
  statusCode: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  checkedAt: Date;
  requestId?: string | null;
  trigger?: string | null;
  probeServer?: string | null;
  probeVersion?: string | null;
  method?: string | null;
  finalUrl?: string | null;
  redirects?: number | null;
  resolvedIp?: string | null;
  dnsMs?: number | null;
  connectMs?: number | null;
  tlsMs?: number | null;
  ttfbMs?: number | null;
  errorCategory?: string | null;
  errorMessage?: string | null;
  finishedAt?: Date | null;
  persistedAt?: Date | null;
};

export type ServerRow = {
  id: bigint | number | string;
  serverKey: string;
  serverName: string;
  cpuPercent: number;
  memoryUsedPercent: number;
  memoryAvailableMb: number;
  swapUsedPercent: number;
  diskUsedPercent: number;
  load1: number;
  containersRunning: number;
  containersUnhealthy: number;
  collectedAt: Date;
  receivedAt: Date;
  observedAt?: Date | null;
  persistedAt?: Date | null;
  requestId?: string | null;
  collectorVersion?: string | null;
  hostname?: string | null;
  sourceIp?: string | null;
  containersTotal?: number | null;
  containersStopped?: number | null;
  raw?: unknown;
};

export type SnapshotMeta = Snapshot["meta"];
type Raw = Record<string, string | number | boolean | null>;
type Scalar = string | number | boolean | null;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function flatRaw(value: unknown): Raw {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Raw = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v as Scalar;
  }
  return out;
}

const HOST_TRANSPORT = [
  "host: /usr/local/bin/avila-server-health (systemd avila-monitoring.timer, 15 s)",
  "HTTPS POST /api/internal/monitoring/servers",
  "Postgres operations.server_health_snapshots",
  "GET /api/monitoring/live",
  "tela /operacao/saude",
];

const PROBE_TRANSPORT_TIMER = [
  "host applications: avila-server-health chama POST /api/internal/monitoring/collect",
  "app: probeUrl() testa a URL",
  "Postgres operations.service_health_checks",
  "GET /api/monitoring/live",
  "tela /operacao/saude",
];

const PROBE_TRANSPORT_SCREEN = [
  "tela /operacao/saude: GET /api/monitoring/live?refresh=1",
  "app: probeUrl() testa a URL",
  "Postgres operations.service_health_checks",
  "resposta da mesma requisição",
  "tela /operacao/saude",
];

function serverMeasurements(row: ServerRow, nowMs: number) {
  const known = SERVERS[row.serverKey as ServerKey];
  const observed = row.observedAt ?? null;
  const fresh = freshness(observed ?? row.receivedAt, nowMs);
  const estimated = !observed;
  const reliability = {
    state: fresh.state === "stale" ? ("stale" as const) : estimated ? ("estimated" as const) : ("live" as const),
    stale: fresh.state === "stale",
    ageMs: fresh.ageMs,
    staleAfterMs: fresh.staleAfterMs,
    note: estimated
      ? "coletor v1: o host não informa a hora da medição; a idade é contada pela chegada ao backend"
      : null,
  };
  const raw = flatRaw(row.raw);
  const version = row.collectorVersion ?? "v1 (não informada)";

  function m<T extends number | null>(
    value: T,
    unit: string | null,
    metric: string,
    formula: string,
    rawKeys: string[],
    extra: Raw = {},
    override?: Partial<HealthMeasurement<T>["reliability"]>,
  ): HealthMeasurement<T> {
    const picked: Raw = {};
    for (const key of rawKeys) if (key in raw) picked[key] = raw[key];
    return {
      value,
      unit,
      status: null,
      observedAt: iso(observed),
      receivedAt: iso(row.receivedAt),
      persistedAt: iso(row.persistedAt),
      source: {
        type: "host-agent",
        server: known?.alias ?? row.serverKey,
        host: known?.ip ?? row.sourceIp ?? null,
        collector: "avila-server-health",
        collectorVersion: version,
        metric,
        endpoint: "POST /api/internal/monitoring/servers",
      },
      calculation: { type: rawKeys.length || formula.includes("×") ? "formula" : "raw", formula, code: "scripts/server-health-collector.sh", version },
      reliability: { ...reliability, ...override },
      raw: { snapshotId: String(row.id), serverKey: row.serverKey, hostname: row.hostname ?? null, ...picked, ...extra },
      transport: HOST_TRANSPORT,
    };
  }

  const missing = { state: "missing" as const, note: "SEM FONTE COMPROVADA: o coletor v1 não envia este campo" };
  return {
    key: row.serverKey,
    alias: known?.alias ?? row.serverKey,
    name: row.serverName,
    ip: known?.ip ?? row.sourceIp ?? "desconhecido",
    hostname: row.hostname ?? null,
    snapshotId: String(row.id),
    requestId: row.requestId ?? null,
    cpu: m(row.cpuPercent, "%", "top Cpu(s) %id", "100 − %idle da 2ª amostra de `top -bn2 -d .2` (janela de ~200 ms)", ["cpu_idle"]),
    memory: m(row.memoryUsedPercent, "%", "/proc/meminfo MemTotal, MemAvailable", "(MemTotal − MemAvailable) / MemTotal × 100", ["mem_total_kb", "mem_available_kb"]),
    memoryAvailableMb: m(row.memoryAvailableMb, "MB", "/proc/meminfo MemAvailable", "MemAvailable (kB) / 1024, arredondado para baixo", ["mem_available_kb"]),
    swap: m(row.swapUsedPercent, "%", "/proc/meminfo SwapTotal, SwapFree", "(SwapTotal − SwapFree) / SwapTotal × 100 (0 sem swap)", ["swap_total_kb", "swap_free_kb"]),
    disk: m(row.diskUsedPercent, "%", "df -P / (Use%)", "coluna Use% de `df -P /`: só a partição raiz", ["disk_used_kb", "disk_size_kb", "disk_mount"]),
    load1: m(row.load1, null, "/proc/loadavg campo 1", "valor lido direto", []),
    containers: {
      running: m(row.containersRunning, "containers", "docker ps -q", "`docker ps -q | wc -l`: só containers em execução", []),
      unhealthy: m(row.containersUnhealthy, "containers", "docker ps --filter health=unhealthy -q", "`docker ps --filter health=unhealthy -q | wc -l`", []),
      total: row.containersTotal === null || row.containersTotal === undefined
        ? m<number | null>(null, "containers", "docker ps -aq", "`docker ps -aq | wc -l`: existentes, em qualquer estado", [], {}, missing)
        : m<number | null>(row.containersTotal, "containers", "docker ps -aq", "`docker ps -aq | wc -l`: existentes, em qualquer estado", []),
      stopped: row.containersStopped === null || row.containersStopped === undefined
        ? m<number | null>(null, "containers", "docker ps -aq − docker ps -q", "existentes − em execução", [], {}, missing)
        : m<number | null>(row.containersStopped, "containers", "docker ps -aq − docker ps -q", "existentes − em execução", []),
    },
  };
}

function serviceView(service: (typeof MONITORED_SERVICES)[number], history: CheckRow[], nowMs: number) {
  const latest = history.at(-1) ?? null;
  const declared = SERVERS[service.server];
  const legacy = latest ? !latest.probeVersion : false;
  const fresh = freshness(latest?.checkedAt ?? null, nowMs);
  const status = (latest?.status ?? "UNKNOWN") as DisplayStatus;
  const httpStatus = latest?.statusCode ?? null;
  const errCode = latest?.errorCode ?? null;
  const probeServer = (latest?.probeServer ?? "apps-client") as ServerKey;
  const hosting = hostingOf(latest?.resolvedIp ?? null);
  const trigger = latest?.trigger ?? null;

  const reliability = {
    state: fresh.state === "missing" ? ("missing" as const) : fresh.state === "stale" ? ("stale" as const) : ("live" as const),
    stale: fresh.state === "stale",
    ageMs: fresh.ageMs,
    staleAfterMs: fresh.staleAfterMs,
    note: !latest
      ? `nenhum check nos últimos ${HISTORY_WINDOW_MS / 60_000} min`
      : legacy
        ? "check do probe v1 (fetch): sem IP resolvido, fases de conexão e mensagem de erro"
        : null,
  };

  const raw: Raw = {
    checkId: latest ? String(latest.id) : null,
    httpStatus,
    latencyMs: latest?.latencyMs ?? null,
    errorCode: errCode,
    errorMessage: latest?.errorMessage ?? null,
    resolvedIp: latest?.resolvedIp ?? null,
    finalUrl: latest?.finalUrl ?? null,
    redirects: latest?.redirects ?? null,
    dnsMs: latest?.dnsMs ?? null,
    connectMs: latest?.connectMs ?? null,
    tlsMs: latest?.tlsMs ?? null,
    ttfbMs: latest?.ttfbMs ?? null,
  };

  const source = {
    type: "http-probe" as const,
    server: latest?.probeServer ? SERVERS[probeServer]?.alias ?? probeServer : `${SERVERS["apps-client"].alias} (container app-avilaops-app-1)`,
    host: SERVERS[probeServer]?.ip ?? null,
    collector: "probeUrl (src/lib/health/probe.ts)",
    collectorVersion: latest?.probeVersion ?? (latest ? "probe-v1 (fetch)" : PROBE_VERSION),
    metric: `GET ${service.url}`,
    endpoint: trigger === "screen" ? "GET /api/monitoring/live?refresh=1" : "POST /api/internal/monitoring/collect",
  };
  const base = {
    observedAt: iso(latest?.checkedAt),
    receivedAt: iso(latest?.finishedAt ?? null),
    persistedAt: iso(latest?.persistedAt ?? null),
    source,
    reliability,
    raw,
    transport: trigger === "screen" ? PROBE_TRANSPORT_SCREEN : PROBE_TRANSPORT_TIMER,
  };

  const recomputed = latest ? classifyProbe({ httpStatus, latencyMs: latest.latencyMs, errorCode: errCode }) : null;
  const statusMeasurement: HealthMeasurement<DisplayStatus> = {
    ...base,
    value: status,
    unit: null,
    status,
    calculation: {
      type: "classification",
      formula: `HEALTHY: ${STATUS_RULES.HEALTHY}; SLOW: ${STATUS_RULES.SLOW}; DOWN: ${STATUS_RULES.DOWN}${recomputed ? ` → ${recomputed.reason}` : ""}`,
      code: "classifyProbe (src/lib/health/classify.ts)",
      version: HEALTH_RULES_VERSION,
    },
  };
  const latencyMeasurement: HealthMeasurement<number | null> = {
    ...base,
    value: latest?.latencyMs ?? null,
    unit: "ms",
    status,
    calculation: {
      type: "formula",
      formula: status === "DOWN"
        ? "tempo do início do probe até o erro: NÃO é tempo de resposta"
        : "tempo do início do probe até os cabeçalhos da resposta final (DNS + TCP + TLS + redirecionamentos + espera); corpo não é baixado",
      code: "probeUrl (src/lib/health/probe.ts)",
      version: latest?.probeVersion ?? "probe-v1 (fetch)",
    },
  };

  return {
    key: service.key,
    name: service.name,
    declaredServer: service.server,
    declaredServerAlias: declared.alias,
    url: service.url,
    method: "GET" as const,
    status: statusMeasurement,
    latency: latencyMeasurement,
    check: {
      id: latest ? String(latest.id) : null,
      requestId: latest?.requestId ?? null,
      trigger,
      probeServer: latest?.probeServer ?? null,
      probeVersion: latest?.probeVersion ?? null,
      httpStatus,
      errorCode: errCode,
      errorCategory: latest?.errorCategory ?? errorCategory(errCode, httpStatus),
      errorMessage: latest?.errorMessage ?? null,
      finalUrl: latest?.finalUrl ?? null,
      redirects: latest?.redirects ?? null,
      resolvedIp: latest?.resolvedIp ?? null,
      hosting,
      hostname: new URL(service.url).hostname,
      timings: {
        dnsMs: latest?.dnsMs ?? null,
        connectMs: latest?.connectMs ?? null,
        tlsMs: latest?.tlsMs ?? null,
        ttfbMs: latest?.ttfbMs ?? null,
      },
      checkedAt: iso(latest?.checkedAt),
      finishedAt: iso(latest?.finishedAt ?? null),
    },
    history: history.slice(-HISTORY_POINTS).map((c) => ({
      at: c.checkedAt.toISOString(),
      status: c.status,
      latencyMs: c.latencyMs,
      httpStatus: c.statusCode,
      errorCode: c.errorCode,
    })),
  };
}

function summaryMeasurement<T extends number | null>(
  value: T,
  unit: string | null,
  metric: string,
  formula: string,
  raw: Raw,
  observedAt: string | null,
  nowMs: number,
  note: string | null,
): HealthMeasurement<T> {
  const fresh = freshness(observedAt, nowMs);
  return {
    value,
    unit,
    status: null,
    observedAt,
    receivedAt: null,
    persistedAt: null,
    source: {
      type: "derived",
      server: null,
      host: null,
      collector: "summarize (src/lib/health/classify.ts)",
      collectorVersion: HEALTH_RULES_VERSION,
      metric,
      endpoint: "GET /api/monitoring/live",
    },
    calculation: { type: "aggregate", formula, code: "summarize (src/lib/health/classify.ts)", version: HEALTH_RULES_VERSION },
    reliability: {
      state: fresh.state === "live" ? "live" : fresh.state,
      stale: fresh.state === "stale",
      ageMs: fresh.ageMs,
      staleAfterMs: fresh.staleAfterMs,
      note,
    },
    raw,
    transport: ["services[] desta mesma resposta", "summarize() no backend", "GET /api/monitoring/live", "tela /operacao/saude"],
  };
}

export function buildSnapshot(input: {
  checks: CheckRow[];
  serverRows: ServerRow[];
  nowMs: number;
  meta: Omit<SnapshotMeta, "thresholds">;
}) {
  const { checks, serverRows, nowMs } = input;
  const services = MONITORED_SERVICES.map((service) =>
    serviceView(service, checks.filter((c) => c.serviceKey === service.key), nowMs),
  );

  const summary = summarize(
    services.map((s) => ({ key: s.key, status: s.status.value, latencyMs: s.latency.value, checkedAt: s.check.checkedAt })),
    nowMs,
  );
  const readings = services.map((s) => s.check.checkedAt).filter((v): v is string => Boolean(v)).sort();
  const oldest = readings[0] ?? null;
  const unknownNote = summary.unknown ? `${summary.unknown} serviço(s) sem leitura atual: ${summary.keys.unknown.join(", ")}` : null;
  const list = (keys: string[]) => (keys.length ? keys.join(", ") : "nenhum");

  const servers = (Object.keys(SERVERS) as ServerKey[])
    .map((key) => serverRows.filter((r) => r.serverKey === key).at(-1))
    .filter((row): row is ServerRow => Boolean(row))
    .map((row) => serverMeasurements(row, nowMs));

  return {
    meta: {
      ...input.meta,
      thresholds: {
        collectIntervalMs: COLLECT_INTERVAL_MS,
        staleAfterMs: STALE_AFTER_MS,
        slowThresholdMs: SLOW_THRESHOLD_MS,
        probeTimeoutMs: PROBE_TIMEOUT_MS,
        historyWindowMs: HISTORY_WINDOW_MS,
        retentionMs: RETENTION_MS,
      },
    },
    summary: {
      healthy: summaryMeasurement(summary.healthy, "serviços", "services[].status = HEALTHY com leitura atual", `conta serviços com status HEALTHY e leitura com até ${STALE_AFTER_MS / 1000} s`, { servicos: list(summary.keys.healthy), total: summary.total }, oldest, nowMs, unknownNote),
      slow: summaryMeasurement(summary.slow, "serviços", "services[].status = SLOW com leitura atual", `conta serviços com status SLOW (${STATUS_RULES.SLOW}) e leitura atual`, { servicos: list(summary.keys.slow), total: summary.total }, oldest, nowMs, unknownNote),
      down: summaryMeasurement(summary.down, "serviços", "services[].status = DOWN com leitura atual", `conta serviços com status DOWN (${STATUS_RULES.DOWN}) e leitura atual`, { servicos: list(summary.keys.down), total: summary.total }, oldest, nowMs, unknownNote),
      unknown: summaryMeasurement(summary.unknown, "serviços", "services[] sem leitura atual", STATUS_RULES.UNKNOWN, { servicos: list(summary.keys.unknown), total: summary.total }, oldest, nowMs, null),
      averageLatency: summaryMeasurement(
        summary.average.valueMs,
        "ms",
        "services[].latency da última leitura",
        summary.average.rule,
        {
          metodo: summary.average.method,
          entraram: list(summary.average.includedKeys),
          ficaram_fora: summary.average.excluded.length ? summary.average.excluded.map((e) => `${e.key} (${e.reason})`).join("; ") : "nenhum",
          janela: "só a última leitura de cada serviço",
          timeout: `timeout de ${PROBE_TIMEOUT_MS} ms vira DOWN e fica fora da média`,
        },
        oldest,
        nowMs,
        unknownNote,
      ),
    },
    servers,
    services,
  };
}

export { analyzeHistory };
