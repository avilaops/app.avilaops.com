import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPublicHostname, normalizeAndValidateHostname } from "@/lib/http";

const PROVIDER = "indexnow";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
// IndexNow keys are meant to be published publicly (served at /{key}.txt) as
// proof of domain ownership — they are not a secret in the API-key sense.
// A shared default is acceptable; INDEXNOW_KEY or DomainAsset.indexNowKey
// let it be overridden per environment or per domain without code changes.
const DEFAULT_KEY = "avilaops-indexnow-20260730";
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const MAX_URLS_PER_SUBMISSION = 10_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_SITEMAP_INDEX_CHILDREN = 50;

type ParsedSitemap =
  | { type: "urlset"; urls: string[] }
  | { type: "sitemapindex"; sitemaps: string[] };

function envKey() {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && KEY_PATTERN.test(key) ? key : null;
}

async function resolveIndexNowKey(fqdn: string) {
  const domain = await prisma.domainAsset.findUnique({
    where: { fqdn },
    select: { indexNowKey: true },
  });

  const domainKey = domain?.indexNowKey?.trim();
  if (domainKey && KEY_PATTERN.test(domainKey)) {
    return domainKey;
  }

  return envKey() ?? DEFAULT_KEY;
}

function stripWww(hostname: string) {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function hostnamesMatch(a: string, b: string) {
  return stripWww(a) === stripWww(b);
}

function keyLocation(fqdn: string, key: string) {
  return `https://${fqdn}/${key}.txt`;
}

function sitemapUrl(fqdn: string) {
  return `https://${fqdn}/sitemap.xml`;
}

function parseSitemap(xml: string): ParsedSitemap {
  const locations = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const uniqueLocations = [...new Set(locations)];

  if (/<sitemapindex[\s>]/i.test(xml)) {
    return { type: "sitemapindex", sitemaps: uniqueLocations };
  }

  if (/<urlset[\s>]/i.test(xml)) {
    return { type: "urlset", urls: uniqueLocations };
  }

  throw new Error("Formato de sitemap XML não reconhecido.");
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "AvilaOpsIndexNow/1.0 (+https://avilaops.com)",
      Accept: "text/plain, application/xml, text/xml;q=0.9, */*;q=0.1",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Resposta excede o tamanho máximo permitido.");
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error("Resposta excede o tamanho máximo permitido.");
  }

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    finalUrl: response.url,
    text,
  };
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function primaryHostname(urls: string[]) {
  const counts = new Map<string, number>();
  for (const url of urls) {
    const hostname = hostnameFromUrl(url);
    if (!hostname) continue;
    counts.set(hostname, (counts.get(hostname) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function fetchSitemapUrls(fqdn: string): Promise<string[]> {
  const sitemap = await fetchText(sitemapUrl(fqdn));
  if (!sitemap.ok) {
    throw new Error(`Sitemap retornou HTTP ${sitemap.status}.`);
  }

  const parsed = parseSitemap(sitemap.text);
  if (parsed.type === "urlset") {
    return parsed.urls;
  }

  const children = parsed.sitemaps.slice(0, MAX_SITEMAP_INDEX_CHILDREN);
  const urls: string[] = [];

  for (const childUrl of children) {
    const childHostname = hostnameFromUrl(childUrl);
    if (!childHostname || !hostnamesMatch(childHostname, fqdn)) continue;

    try {
      const child = await fetchText(childUrl);
      if (!child.ok) continue;
      const childParsed = parseSitemap(child.text);
      if (childParsed.type === "urlset") {
        urls.push(...childParsed.urls);
      }
    } catch {
      // A single unreachable child sitemap shouldn't fail the whole batch.
    }
  }

  return [...new Set(urls)];
}

function normalizeLimit(limit?: number) {
  if (limit === undefined) return MAX_URLS_PER_SUBMISSION;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("O limite deve ser um inteiro entre 1 e 10.000.");
  }

  return Math.min(limit, MAX_URLS_PER_SUBMISSION);
}

async function saveConnectionState(input: {
  fqdn: string;
  status: "ACTIVE" | "PENDING" | "ERROR";
  syncStatus: string;
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  return prisma.integrationConnection.upsert({
    where: { provider_siteUrl: { provider: PROVIDER, siteUrl: input.fqdn } },
    create: {
      provider: PROVIDER,
      siteUrl: input.fqdn,
      status: input.status,
      lastSyncedAt: now,
      lastSyncStatus: input.syncStatus,
      lastSyncError: input.error ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      status: input.status,
      lastSyncedAt: now,
      lastSyncStatus: input.syncStatus,
      lastSyncError: input.error ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function auditIndexNowKey(fqdn: string) {
  const hostname = normalizeAndValidateHostname(fqdn);
  await assertPublicHostname(hostname);

  const key = await resolveIndexNowKey(hostname);
  const location = keyLocation(hostname, key);

  try {
    const response = await fetchText(location);
    const finalHostname = hostnameFromUrl(response.finalUrl);
    const valid =
      response.ok &&
      Boolean(finalHostname) &&
      hostnamesMatch(finalHostname!, hostname) &&
      response.text.trim() === key;

    return {
      ok: valid,
      key,
      keyLocation: location,
      status: response.status,
      error: valid
        ? null
        : `Arquivo de chave ausente, redirecionado para outro host ou com conteúdo diferente de ${key}.`,
    };
  } catch (error) {
    return {
      ok: false,
      key,
      keyLocation: location,
      status: null,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao consultar arquivo de chave IndexNow.",
    };
  }
}

export async function submitIndexNowUrls(input: {
  fqdn: string;
  urls?: string[];
  limit?: number;
}) {
  const fqdn = normalizeAndValidateHostname(input.fqdn);
  const limit = normalizeLimit(input.limit);
  await assertPublicHostname(fqdn);

  const key = await resolveIndexNowKey(fqdn);
  const location = keyLocation(fqdn, key);
  const keyAudit = await auditIndexNowKey(fqdn);

  if (!keyAudit.ok) {
    const connection = await saveConnectionState({
      fqdn,
      status: "PENDING",
      syncStatus: "KEY_MISSING",
      error: keyAudit.error,
      metadata: { keyLocation: location, keyAudit },
    });

    return { ok: false, connection, keyAudit, submitted: 0, urls: [] };
  }

  let urls = input.urls?.filter(Boolean) ?? [];
  if (urls.length === 0) {
    try {
      urls = await fetchSitemapUrls(fqdn);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao ler o sitemap.";
      await saveConnectionState({
        fqdn,
        status: "ERROR",
        syncStatus: "SITEMAP_ERROR",
        error: message,
        metadata: { keyLocation: location, keyAudit },
      });
      throw error;
    }
  }

  const selectedUrls = [...new Set(urls)]
    .filter((url) => {
      const hostname = hostnameFromUrl(url);
      return Boolean(hostname) && hostnamesMatch(hostname!, fqdn);
    })
    .slice(0, limit);

  if (selectedUrls.length === 0) {
    const canonicalHost = primaryHostname(urls);
    if (canonicalHost && !hostnamesMatch(canonicalHost, fqdn)) {
      const metadata = {
        keyLocation: location,
        keyAudit,
        canonicalHost,
        sourceSitemap: sitemapUrl(fqdn),
        detectedUrlCount: urls.length,
      };
      const connection = await saveConnectionState({
        fqdn,
        status: "ACTIVE",
        syncStatus: "REDIRECT_DOMAIN",
        error: null,
        metadata,
      });

      return {
        ok: true,
        connection,
        keyAudit,
        submitted: 0,
        urls: [],
        canonicalHost,
      };
    }

    throw new Error("Nenhuma URL válida do domínio foi encontrada para envio.");
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: fqdn,
      key,
      keyLocation: location,
      urlList: selectedUrls,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const responseText = await response.text();
  const retryAfter = response.headers.get("retry-after");

  const syncStatus =
    response.status === 200
      ? "SUCCESS"
      : response.status === 202
        ? "VALIDATION_PENDING"
        : response.status === 429
          ? "RATE_LIMITED"
          : "SUBMIT_ERROR";
  const connectionStatus =
    response.status === 200 ? "ACTIVE" : response.status === 202 ? "PENDING" : "ERROR";
  const success = response.status === 200 || response.status === 202;

  const metadata = {
    keyLocation: location,
    endpoint: INDEXNOW_ENDPOINT,
    submittedCount: selectedUrls.length,
    submittedUrlSample: selectedUrls.slice(0, 100),
    firstUrl: selectedUrls[0] ?? null,
    lastUrl: selectedUrls.at(-1) ?? null,
    responseStatus: response.status,
    responseBody: responseText.slice(0, 1000),
    retryAfter,
    keyAudit,
  };

  const connection = await saveConnectionState({
    fqdn,
    status: connectionStatus,
    syncStatus,
    error: success ? null : responseText || `HTTP ${response.status}`,
    metadata,
  });

  return {
    ok: success,
    connection,
    keyAudit,
    submitted: selectedUrls.length,
    urls: selectedUrls,
    responseStatus: response.status,
    responseBody: responseText,
  };
}

export async function submitIndexNowForAllDomains(input?: { limitPerDomain?: number }) {
  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { fqdn: true },
    orderBy: { fqdn: "asc" },
  });

  const results = [];
  for (const domain of domains) {
    try {
      const result = await submitIndexNowUrls({
        fqdn: domain.fqdn,
        limit: input?.limitPerDomain,
      });
      results.push({
        fqdn: domain.fqdn,
        ok: result.ok,
        status: result.connection.lastSyncStatus,
        submitted: result.submitted,
        error: result.connection.lastSyncError,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao enviar domínio ao IndexNow.";
      const connection = await saveConnectionState({
        fqdn: domain.fqdn,
        status: "ERROR",
        syncStatus: "SUBMIT_ERROR",
        error: message,
        metadata: { error: message },
      });
      results.push({
        fqdn: domain.fqdn,
        ok: false,
        status: connection.lastSyncStatus,
        submitted: 0,
        error: message,
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    total: results.length,
    successful: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

export const INDEXNOW_PROVIDER = PROVIDER;
export const INDEXNOW_DEFAULT_KEY = DEFAULT_KEY;
