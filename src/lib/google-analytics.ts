import { google } from "googleapis";

/**
 * GA4 das empresas do grupo, lido de verdade pela conta de serviço.
 *
 * Até 17/09/2026 esta lib devolvia um bloco fixo ("14 online", 15.420 sessões,
 * canais inventados) sempre que a página não passava `propertyId`, o que era
 * sempre, e o "ativos agora" era `Math.random()`. A conta de serviço de
 * produção (`claude@contatos-424700`) já enxerga as propriedades da conta
 * AvilaOps no Analytics (16 em 16/09/2026), então agora:
 *
 * - sem `propertyId`, os números são a SOMA de todas as propriedades que a
 *   conta enxerga (taxa de rejeição e duração ponderadas por sessões);
 * - com `propertyId`, só daquela propriedade;
 * - se a API falhar, a função lança o erro. Não existe mais número de reserva.
 */

export interface Ga4OverviewMetrics {
  realtimeActiveUsers: number;
  sessions30Days: number;
  totalUsers30Days: number;
  pageViews30Days: number;
  bounceRate: number;
  averageSessionDurationSec: number;
  topChannels: { channel: string; users: number; percentage: number }[];
  lastUpdated: string;
  /** Propriedades somadas, para a tela dizer de onde veio o total. */
  properties: Ga4Property[];
}

export type Ga4Property = {
  /** `properties/123` */
  id: string;
  name: string;
  account: string;
  realtimeActiveUsers: number;
  sessions30Days: number;
  totalUsers30Days: number;
};

const ESCOPO = ["https://www.googleapis.com/auth/analytics.readonly"];
/** Evita 40+ chamadas à API a cada abertura da tela. */
const CACHE_MS = 60_000;

function getGoogleCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");
  return JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
}

function auth() {
  return new google.auth.GoogleAuth({ credentials: getGoogleCredentials(), scopes: ESCOPO });
}

export async function listGa4Properties(): Promise<{ id: string; name: string; account: string }[]> {
  const admin = google.analyticsadmin({ version: "v1beta", auth: auth() });
  const out: { id: string; name: string; account: string }[] = [];
  let pageToken: string | undefined;
  do {
    const r = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const conta of r.data.accountSummaries ?? []) {
      for (const p of conta.propertySummaries ?? []) {
        if (p.property) out.push({ id: p.property, name: p.displayName ?? p.property, account: conta.displayName ?? "" });
      }
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

const numero = (v: string | null | undefined) => (v ? Number(v) : 0);

async function lerPropriedade(property: { id: string; name: string; account: string }) {
  const data = google.analyticsdata({ version: "v1beta", auth: auth() });
  const [agora, resumo, canais] = await Promise.all([
    data.properties.runRealtimeReport({ property: property.id, requestBody: { metrics: [{ name: "activeUsers" }] } }),
    data.properties.runReport({
      property: property.id,
      requestBody: {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      },
    }),
    data.properties.runReport({
      property: property.id,
      requestBody: {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "activeUsers" }],
      },
    }),
  ]);
  const linha = resumo.data.rows?.[0]?.metricValues ?? [];
  return {
    property,
    realtime: numero(agora.data.rows?.[0]?.metricValues?.[0]?.value),
    users: numero(linha[0]?.value),
    sessions: numero(linha[1]?.value),
    pageViews: numero(linha[2]?.value),
    bounceRate: numero(linha[3]?.value),
    avgDuration: numero(linha[4]?.value),
    channels: (canais.data.rows ?? []).map((r) => ({
      channel: r.dimensionValues?.[0]?.value ?? "(sem canal)",
      users: numero(r.metricValues?.[0]?.value),
    })),
  };
}

let cache: { chave: string; em: number; valor: Ga4OverviewMetrics } | null = null;

export async function getGa4OverviewMetrics(propertyId?: string): Promise<Ga4OverviewMetrics> {
  const chave = propertyId ?? "*";
  if (cache && cache.chave === chave && Date.now() - cache.em < CACHE_MS) return cache.valor;

  const todas = await listGa4Properties();
  const alvo = propertyId ? todas.filter((p) => p.id === propertyId) : todas;
  if (propertyId && alvo.length === 0) throw new Error(`Propriedade ${propertyId} não acessível pela conta de serviço`);

  const lidas = await Promise.all(alvo.map(lerPropriedade));
  const sessions = lidas.reduce((s, p) => s + p.sessions, 0);
  const users = lidas.reduce((s, p) => s + p.users, 0);
  const porCanal = new Map<string, number>();
  for (const p of lidas) for (const c of p.channels) porCanal.set(c.channel, (porCanal.get(c.channel) ?? 0) + c.users);
  const totalCanais = [...porCanal.values()].reduce((s, v) => s + v, 0);

  const valor: Ga4OverviewMetrics = {
    realtimeActiveUsers: lidas.reduce((s, p) => s + p.realtime, 0),
    sessions30Days: sessions,
    totalUsers30Days: users,
    pageViews30Days: lidas.reduce((s, p) => s + p.pageViews, 0),
    // A API devolve fração (0,38); a tela espera porcentagem.
    bounceRate: sessions ? (lidas.reduce((s, p) => s + p.bounceRate * p.sessions, 0) / sessions) * 100 : 0,
    averageSessionDurationSec: sessions ? Math.round(lidas.reduce((s, p) => s + p.avgDuration * p.sessions, 0) / sessions) : 0,
    topChannels: [...porCanal.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([channel, u]) => ({ channel, users: u, percentage: totalCanais ? Math.round((u / totalCanais) * 1000) / 10 : 0 })),
    lastUpdated: new Date().toISOString(),
    properties: lidas.map((p) => ({
      id: p.property.id,
      name: p.property.name,
      account: p.property.account,
      realtimeActiveUsers: p.realtime,
      sessions30Days: p.sessions,
      totalUsers30Days: p.users,
    })),
  };
  cache = { chave, em: Date.now(), valor };
  return valor;
}
