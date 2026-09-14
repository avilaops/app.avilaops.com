import { prisma } from "@/lib/prisma";

export const MONITORED_SERVICES = [
  { key: "n8n", name: "n8n", server: "apps-noclient", url: "https://n8n.avilaops.com/healthz" },
  { key: "notas", name: "Notas", server: "apps-noclient", url: "https://notas.avilaops.com/" },
  { key: "ia", name: "Ávila IA", server: "apps-noclient", url: "https://ia.avilaops.com/" },
  { key: "sms", name: "Ávila SMS", server: "apps-noclient", url: "https://sms.avilaops.com/" },
  { key: "crm", name: "CRM", server: "apps-noclient", url: "https://crm.avilaops.com/" },
  { key: "arxisvr", name: "ArxisVR", server: "apps-noclient", url: "https://arxisvr.avilaops.com/" },
  { key: "alo-barbeiro", name: "Alô Barbeiro", server: "apps-noclient", url: "https://alobarbeiro.com/" },
  { key: "cdda", name: "CDDA Judô", server: "apps-noclient", url: "https://cdda.avilaops.com/" },
  { key: "engops", name: "EngOps", server: "apps-noclient", url: "https://engops.avilaops.com/" },
  { key: "app-avila", name: "App Ávila Ops", server: "apps-client", url: "https://app.avilaops.com/api/health" },
  { key: "site-avila", name: "Site Ávila Ops", server: "apps-client", url: "https://avilaops.com/" },
  { key: "saude-pet", name: "Saúde Pet", server: "apps-client", url: "https://saudepet.app.br/" },
  { key: "lojas", name: "Lojas Ávila Ops", server: "apps-client", url: "https://lojas.avilaops.com/api/health" },
  { key: "mail", name: "Ávila Mail", server: "apps-client", url: "https://mail.avilaops.com/" },
  { key: "brasa", name: "Brasa Mineira", server: "apps-client", url: "https://brasa.comandeiro.com.br/api/health" },
  { key: "cifra", name: "CIFRA", server: "apps-client", url: "https://cifrainssdeobras.com.br/healthz" },
  { key: "mello", name: "Mello Transportes", server: "apps-client", url: "https://mellotransportesriopreto.com.br/" },
  { key: "fenix", name: "Fênix Eletrodos", server: "apps-client", url: "https://fenixeletrodos.com.br/" },
  { key: "despolariza", name: "DespolarizaMED", server: "apps-client", url: "https://despolarizamed.com.br/" },
  { key: "sorroche", name: "Sorroche", server: "apps-client", url: "https://sorroche.beauty/" },
] as const;

export type ServiceStatus = "HEALTHY" | "SLOW" | "DOWN";

function errorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  const cause = error.cause as { code?: string } | undefined;
  return cause?.code ?? (error.name === "AbortError" ? "TIMEOUT" : error.name.toUpperCase());
}

export async function probeService(service: (typeof MONITORED_SERVICES)[number]) {
  const started = performance.now();
  let statusCode: number | null = null;
  let latencyMs: number | null = null;
  let status: ServiceStatus = "DOWN";
  let failure: string | null = null;
  try {
    const response = await fetch(service.url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "AvilaOps-Realtime-Monitor/1.0" },
    });
    latencyMs = Math.round(performance.now() - started);
    statusCode = response.status;
    await response.body?.cancel();
    status = !response.ok ? "DOWN" : latencyMs > 2_500 ? "SLOW" : "HEALTHY";
  } catch (error) {
    latencyMs = Math.round(performance.now() - started);
    failure = errorCode(error);
  }
  return { ...service, status, statusCode, latencyMs, errorCode: failure, checkedAt: new Date() };
}

export async function collectServices() {
  const results = await Promise.all(MONITORED_SERVICES.map(probeService));
  await prisma.serviceHealthCheck.createMany({
    data: results.map((r) => ({
      serviceKey: r.key, serviceName: r.name, serverKey: r.server, url: r.url,
      status: r.status, statusCode: r.statusCode, latencyMs: r.latencyMs,
      errorCode: r.errorCode, checkedAt: r.checkedAt,
    })),
  });
  // Retenção curta e previsível: uma coleta a cada 30 s = ~57 mil linhas/dia.
  if (Math.random() < 0.02) {
    await prisma.serviceHealthCheck.deleteMany({ where: { checkedAt: { lt: new Date(Date.now() - 86_400_000) } } });
    await prisma.serverHealthSnapshot.deleteMany({ where: { collectedAt: { lt: new Date(Date.now() - 86_400_000) } } });
  }
  return results;
}

export async function monitoringSnapshot(refresh = false) {
  if (refresh) await collectServices();
  const since = new Date(Date.now() - 30 * 60_000);
  const [checks, serverRows] = await Promise.all([
    prisma.serviceHealthCheck.findMany({ where: { checkedAt: { gte: since } }, orderBy: { checkedAt: "asc" } }),
    prisma.serverHealthSnapshot.findMany({ where: { collectedAt: { gte: since } }, orderBy: { collectedAt: "asc" } }),
  ]);
  const services = MONITORED_SERVICES.map((service) => {
    const history = checks.filter((c) => c.serviceKey === service.key);
    const latest = history.at(-1);
    return {
      ...service,
      status: latest?.status ?? "UNKNOWN",
      statusCode: latest?.statusCode ?? null,
      latencyMs: latest?.latencyMs ?? null,
      errorCode: latest?.errorCode ?? null,
      checkedAt: latest?.checkedAt.toISOString() ?? null,
      history: history.slice(-30).map((c) => ({ latencyMs: c.latencyMs, status: c.status, at: c.checkedAt.toISOString() })),
    };
  });
  const servers = ["apps-client", "apps-noclient"].map((key) => {
    const history = serverRows.filter((s) => s.serverKey === key);
    const latest = history.at(-1);
    return latest ? { ...latest, id: latest.id.toString(), collectedAt: latest.collectedAt.toISOString(), receivedAt: latest.receivedAt.toISOString() } : null;
  }).filter(Boolean);
  return { generatedAt: new Date().toISOString(), services, servers };
}
