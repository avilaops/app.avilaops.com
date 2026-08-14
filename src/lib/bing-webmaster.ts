import { prisma } from "@/lib/prisma";
import { fetchSitemapUrls } from "@/lib/indexnow";

const PROVIDER = "bing_webmaster";
const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const MAX_URLS_PER_SUBMISSION = 500;

function getApiKey() {
  const key = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!key) {
    throw new Error("BING_WEBMASTER_API_KEY não configurado nas variáveis de ambiente.");
  }
  return key;
}

export interface BingSubmitResult {
  fqdn: string;
  siteUrl: string;
  urlsSubmitted: string[];
  submittedAt: string;
  quotaRemaining?: number;
  success: boolean;
  error?: string;
}

export async function submitUrlsToBing(fqdn: string, urls: string[]): Promise<BingSubmitResult> {
  const apiKey = getApiKey();
  const siteUrl = `https://${fqdn}`;

  const payload = {
    siteUrl,
    urlList: urls,
  };

  const endpoint = `${BING_API_BASE}/SubmitUrlbatch?apikey=${apiKey}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Bing API erro HTTP ${res.status}: ${errText}`);
    }

    const result: BingSubmitResult = {
      fqdn,
      siteUrl,
      urlsSubmitted: urls,
      submittedAt: new Date().toISOString(),
      success: true,
    };

    await prisma.integrationConnection.upsert({
      where: {
        provider_siteUrl: {
          provider: PROVIDER,
          siteUrl: fqdn,
        },
      },
      create: {
        provider: PROVIDER,
        siteUrl: fqdn,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        lastSyncStatus: "SUCCESS",
        metadata: JSON.parse(JSON.stringify(result)),
      },
      update: {
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastSyncError: null,
        metadata: JSON.parse(JSON.stringify(result)),
      },
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const failedResult: BingSubmitResult = {
      fqdn,
      siteUrl,
      urlsSubmitted: urls,
      submittedAt: new Date().toISOString(),
      success: false,
      error: errorMessage,
    };

    await prisma.integrationConnection.upsert({
      where: {
        provider_siteUrl: {
          provider: PROVIDER,
          siteUrl: fqdn,
        },
      },
      create: {
        provider: PROVIDER,
        siteUrl: fqdn,
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: errorMessage,
        metadata: JSON.parse(JSON.stringify(failedResult)),
      },
      update: {
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: errorMessage,
        metadata: JSON.parse(JSON.stringify(failedResult)),
      },
    });

    return failedResult;
  }
}

/**
 * Reads the domain's sitemap.xml (same source used by IndexNow) and submits
 * its URLs to Bing — so callers don't need to pass a URL list by hand.
 */
export async function submitSitemapToBing(fqdn: string): Promise<BingSubmitResult> {
  let urls: string[];
  try {
    urls = (await fetchSitemapUrls(fqdn)).slice(0, MAX_URLS_PER_SUBMISSION);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fetchFailedResult: BingSubmitResult = {
      fqdn,
      siteUrl: `https://${fqdn}`,
      urlsSubmitted: [],
      submittedAt: new Date().toISOString(),
      success: false,
      error: `Falha ao buscar sitemap: ${message}`,
    };

    await prisma.integrationConnection.upsert({
      where: { provider_siteUrl: { provider: PROVIDER, siteUrl: fqdn } },
      create: {
        provider: PROVIDER,
        siteUrl: fqdn,
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: fetchFailedResult.error,
        metadata: JSON.parse(JSON.stringify(fetchFailedResult)),
      },
      update: {
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: fetchFailedResult.error,
        metadata: JSON.parse(JSON.stringify(fetchFailedResult)),
      },
    });

    return fetchFailedResult;
  }

  if (urls.length === 0) {
    const emptyResult: BingSubmitResult = {
      fqdn,
      siteUrl: `https://${fqdn}`,
      urlsSubmitted: [],
      submittedAt: new Date().toISOString(),
      success: false,
      error: "Nenhuma URL encontrada no sitemap.",
    };

    await prisma.integrationConnection.upsert({
      where: { provider_siteUrl: { provider: PROVIDER, siteUrl: fqdn } },
      create: {
        provider: PROVIDER,
        siteUrl: fqdn,
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: emptyResult.error,
        metadata: JSON.parse(JSON.stringify(emptyResult)),
      },
      update: {
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: emptyResult.error,
        metadata: JSON.parse(JSON.stringify(emptyResult)),
      },
    });

    return emptyResult;
  }

  return submitUrlsToBing(fqdn, urls);
}

export async function submitBingForAllDomains(): Promise<{
  ok: boolean;
  total: number;
  successful: number;
  failed: number;
  results: BingSubmitResult[];
}> {
  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { fqdn: true },
    orderBy: { fqdn: "asc" },
  });

  const results: BingSubmitResult[] = [];
  for (const domain of domains) {
    results.push(await submitSitemapToBing(domain.fqdn));
  }

  return {
    ok: results.every((result) => result.success),
    total: results.length,
    successful: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}
