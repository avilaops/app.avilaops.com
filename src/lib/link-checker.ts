import { prisma } from "@/lib/prisma";

const PROVIDER = "link_audit";
const MAX_LINKS_PER_DOMAIN = 30;
const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT = "AvilaOpsLinkChecker/1.0 (+https://avilaops.com)";

export interface LinkCheckResult {
  fqdn: string;
  checkedAt: string;
  totalLinksChecked: number;
  brokenLinksCount: number;
  brokenLinks: Array<{
    url: string;
    status: number | null;
    error?: string;
  }>;
  status: "ACTIVE" | "WARNING" | "FAIL";
}

export async function runLinkAuditForDomain(fqdn: string): Promise<LinkCheckResult> {
  const baseUrl = `https://${fqdn}`;

  let homeHtml = "";
  try {
    const res = await fetch(baseUrl, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      homeHtml = await res.text();
    }
  } catch (err) {
    console.error(`Erro ao acessar home de ${fqdn} para auditoria de links:`, err);
  }

  // Extract internal and relative hrefs
  const hrefMatches = Array.from(homeHtml.matchAll(/href=["']([^"']+)["']/gi))
    .map((m) => m[1]?.trim())
    .filter((href): href is string => Boolean(href) && !href.startsWith("#") && !href.startsWith("javascript:"));

  const targetUrls = new Set<string>();
  for (const href of hrefMatches) {
    if (href.startsWith("http://") || href.startsWith("https://")) {
      if (href.includes(fqdn)) {
        targetUrls.add(href);
      }
    } else if (href.startsWith("/")) {
      targetUrls.add(`${baseUrl}${href}`);
    }
    if (targetUrls.size >= MAX_LINKS_PER_DOMAIN) break;
  }

  const urlsToCheck = Array.from(targetUrls);
  const brokenLinks: Array<{ url: string; status: number | null; error?: string }> = [];

  await Promise.all(
    urlsToCheck.map(async (url) => {
      try {
        const res = await fetch(url, {
          method: "HEAD",
          headers: { "User-Agent": USER_AGENT },
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok && res.status !== 405) {
          // If HEAD 405 Method Not Allowed, fallback to GET
          const getRes = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": USER_AGENT },
            cache: "no-store",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!getRes.ok) {
            brokenLinks.push({ url, status: getRes.status });
          }
        }
      } catch (err) {
        brokenLinks.push({
          url,
          status: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  const status: "ACTIVE" | "WARNING" | "FAIL" =
    brokenLinks.length === 0 ? "ACTIVE" : brokenLinks.length <= 2 ? "WARNING" : "FAIL";

  const result: LinkCheckResult = {
    fqdn,
    checkedAt: new Date().toISOString(),
    totalLinksChecked: urlsToCheck.length,
    brokenLinksCount: brokenLinks.length,
    brokenLinks,
    status,
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
      status,
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      metadata: JSON.parse(JSON.stringify(result)),
    },
    update: {
      status,
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      lastSyncError: brokenLinks.length > 0 ? `${brokenLinks.length} links quebrados encontrados` : null,
      metadata: JSON.parse(JSON.stringify(result)),
    },
  });

  return result;
}
