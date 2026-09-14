import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const PROVIDER = "lighthouse";
const FETCH_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;

export type PageSpeedStatus = "ACTIVE" | "WARNING" | "FAIL" | "UNKNOWN";

export interface PageSpeedAuditResult {
  fqdn: string;
  checkedAt: string;
  /** false quando a coleta falhou: os campos de métrica são null e não valem como medição. */
  measured: boolean;
  performanceScore: number | null; // 0 a 100
  seoScore: number | null; // 0 a 100
  lcp: string | null; // ex.: "1.8 s"
  cls: string | null; // ex.: "0.02"
  inp: string | null; // ex.: "120 ms"
  status: PageSpeedStatus;
  error?: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(httpStatus: number) {
  return httpStatus === 429 || httpStatus >= 500;
}

function buildApiUrl(fqdn: string) {
  const targetUrl = `https://${fqdn}`;
  const params = new URLSearchParams({ url: targetUrl, strategy: "mobile" });
  params.append("category", "PERFORMANCE");
  params.append("category", "SEO");

  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  if (apiKey) params.set("key", apiKey);

  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
}

/**
 * Sem credencial a chamada cai na cota anônima compartilhada do Google, que vive
 * estourada (HTTP 429). Com a service account já configurada em
 * GOOGLE_SERVICE_ACCOUNT_JSON a cota passa a ser a do projeto da Ávila Ops.
 */
export function hasPageSpeedCredentials() {
  return Boolean(process.env.PAGESPEED_API_KEY?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

type TokenClient = { getAccessToken(): Promise<{ token?: string | null }> };
let authClientPromise: Promise<TokenClient | null> | null = null;

function getServiceAccountClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  if (!authClientPromise) {
    authClientPromise = (async () => {
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(raw),
          // O PageSpeed Insights aceita OAuth com o escopo openid.
          scopes: ["openid"],
        });
        return (await auth.getClient()) as unknown as TokenClient;
      } catch (err) {
        console.error(
          "PageSpeed: falha ao autenticar com GOOGLE_SERVICE_ACCOUNT_JSON:",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    })();
  }

  return authClientPromise;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  if (process.env.PAGESPEED_API_KEY?.trim()) return {};

  const clientPromise = getServiceAccountClient();
  if (!clientPromise) return {};

  try {
    const client = await clientPromise;
    const token = (await client?.getAccessToken())?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (err) {
    console.error(
      "PageSpeed: falha ao obter access token:",
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

/**
 * Consulta o PageSpeed Insights. Nunca inventa número: quando a coleta falha o
 * resultado volta com measured=false e métricas null, e a última medição real
 * gravada no banco é preservada (só o estado de sincronização é atualizado).
 */
export async function runPageSpeedAuditForDomain(fqdn: string): Promise<PageSpeedAuditResult> {
  const apiUrl = buildApiUrl(fqdn);
  let lastError = "Falha desconhecida ao consultar o PageSpeed Insights.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(apiUrl, {
        cache: "no-store",
        headers: await buildAuthHeaders(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const apiMessage = (() => {
          try {
            return (JSON.parse(detail) as { error?: { message?: string } })?.error?.message ?? null;
          } catch {
            return null;
          }
        })();

        lastError = `Google PageSpeed API retornou status HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : ""}`;

        if (isRetryable(res.status) && attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }

        if (res.status === 429 && !hasPageSpeedCredentials()) {
          lastError +=
            " (cota anônima compartilhada esgotada - configure PAGESPEED_API_KEY ou GOOGLE_SERVICE_ACCOUNT_JSON)";
        }

        return persistFailure(fqdn, lastError);
      }

      const data = await res.json();
      const lighthouse = data.lighthouseResult;
      const categories = lighthouse?.categories ?? {};
      const audits = lighthouse?.audits ?? {};

      const rawPerformance = categories.performance?.score;
      const rawSeo = categories.seo?.score;

      if (typeof rawPerformance !== "number") {
        lastError = "Resposta do PageSpeed Insights sem score de performance.";
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        return persistFailure(fqdn, lastError);
      }

      const performanceScore = Math.round(rawPerformance * 100);
      const seoScore = typeof rawSeo === "number" ? Math.round(rawSeo * 100) : null;

      const status: PageSpeedStatus =
        performanceScore >= 80 ? "ACTIVE" : performanceScore >= 50 ? "WARNING" : "FAIL";

      const auditResult: PageSpeedAuditResult = {
        fqdn,
        checkedAt: new Date().toISOString(),
        measured: true,
        performanceScore,
        seoScore,
        lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
        cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
        inp: audits["interaction-to-next-paint"]?.displayValue ?? null,
        status,
        error: null,
      };

      await prisma.integrationConnection.upsert({
        where: { provider_siteUrl: { provider: PROVIDER, siteUrl: fqdn } },
        create: {
          provider: PROVIDER,
          siteUrl: fqdn,
          status,
          lastSyncedAt: new Date(),
          lastSyncStatus: "SUCCESS",
          metadata: JSON.parse(JSON.stringify(auditResult)),
        },
        update: {
          status,
          lastSyncedAt: new Date(),
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
          metadata: JSON.parse(JSON.stringify(auditResult)),
        },
      });

      return auditResult;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
    }
  }

  return persistFailure(fqdn, lastError);
}

/**
 * Grava o insucesso sem sobrescrever a última medição válida. Se nunca houve
 * medição, o metadata fica explicitamente "não medido" (measured=false).
 */
async function persistFailure(fqdn: string, errorMessage: string): Promise<PageSpeedAuditResult> {
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider_siteUrl: { provider: PROVIDER, siteUrl: fqdn } },
    select: { metadata: true },
  });

  const previous = existing?.metadata as PageSpeedAuditResult | null;
  const hasPreviousMeasurement = previous?.measured === true && typeof previous.performanceScore === "number";

  const unmeasured: PageSpeedAuditResult = {
    fqdn,
    checkedAt: new Date().toISOString(),
    measured: false,
    performanceScore: null,
    seoScore: null,
    lcp: null,
    cls: null,
    inp: null,
    status: "UNKNOWN",
    error: errorMessage,
  };

  const metadata = hasPreviousMeasurement
    ? { ...previous, error: errorMessage }
    : unmeasured;

  await prisma.integrationConnection.upsert({
    where: { provider_siteUrl: { provider: PROVIDER, siteUrl: fqdn } },
    create: {
      provider: PROVIDER,
      siteUrl: fqdn,
      status: "UNKNOWN",
      lastSyncedAt: new Date(),
      lastSyncStatus: "ERROR",
      lastSyncError: errorMessage,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
    update: {
      status: hasPreviousMeasurement ? previous!.status : "UNKNOWN",
      lastSyncedAt: new Date(),
      lastSyncStatus: "ERROR",
      lastSyncError: errorMessage,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
  });

  return unmeasured;
}
