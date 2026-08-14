import { prisma } from "@/lib/prisma";

const PROVIDER = "seo_audit";
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = "AvilaOpsSeoAuditor/1.0 (+https://avilaops.com)";

export interface DomainSeoAuditResult {
  fqdn: string;
  checkedAt: string;
  score: number;
  status: "ACTIVE" | "WARNING" | "FAIL";
  robots: {
    ok: boolean;
    status: number | null;
    hasSitemap: boolean;
  };
  sitemap: {
    ok: boolean;
    status: number | null;
    type?: "urlset" | "sitemapindex" | "unknown";
    urlCount: number;
  };
  llms: {
    ok: boolean;
    status: number | null;
    hasContent: boolean;
  };
  favicon: {
    ok: boolean;
    status: number | null;
  };
  manifest: {
    ok: boolean;
    status: number | null;
  };
  homeHtml: {
    ok: boolean;
    status: number | null;
    canonical?: string | null;
    hasCanonical: boolean;
    hasOgTitle: boolean;
    hasOgDescription: boolean;
    hasOgImage: boolean;
    hasTwitterCard: boolean;
    hasJsonLd: boolean;
  };
  error?: string | null;
}

async function safeFetch(url: string, accept = "*/*") {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, url: res.url };
  } catch (err) {
    return { ok: false, status: null, text: "", url, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runSeoAuditForDomain(fqdn: string): Promise<DomainSeoAuditResult> {
  const baseUrl = `https://${fqdn}`;

  const [robotsRes, sitemapRes, llmsRes, faviconRes, manifestRes, homeRes] = await Promise.all([
    safeFetch(`${baseUrl}/robots.txt`, "text/plain"),
    safeFetch(`${baseUrl}/sitemap.xml`, "application/xml, text/xml"),
    safeFetch(`${baseUrl}/llms.txt`, "text/plain"),
    safeFetch(`${baseUrl}/favicon.ico`),
    safeFetch(`${baseUrl}/manifest.json`, "application/json"),
    safeFetch(`${baseUrl}/`, "text/html"),
  ]);

  // 1. Robots.txt
  const robotsOk = robotsRes.ok && robotsRes.status === 200;
  const hasSitemapInRobots = /sitemap:\s*http/i.test(robotsRes.text);

  // 2. Sitemap.xml
  const sitemapOk = sitemapRes.ok && sitemapRes.status === 200;
  let sitemapType: "urlset" | "sitemapindex" | "unknown" = "unknown";
  let urlCount = 0;
  if (sitemapOk && sitemapRes.text) {
    if (/<sitemapindex[\s>]/i.test(sitemapRes.text)) sitemapType = "sitemapindex";
    else if (/<urlset[\s>]/i.test(sitemapRes.text)) sitemapType = "urlset";
    const locMatches = sitemapRes.text.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi);
    urlCount = locMatches ? locMatches.length : 0;
  }

  // 3. llms.txt
  const llmsOk = llmsRes.ok && llmsRes.status === 200;
  const llmsHasContent = llmsRes.text.trim().length > 20;

  // 4. Favicon
  const faviconOk = faviconRes.ok && faviconRes.status === 200;

  // 5. Manifest
  const manifestOk = manifestRes.ok && manifestRes.status === 200;

  // 6. Home HTML tags
  const homeOk = homeRes.ok && homeRes.status === 200;
  const html = homeRes.text;

  const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : null;
  const hasCanonical = Boolean(canonical);

  const hasOgTitle = /<meta\s+[^>]*property=["']og:title["']/i.test(html) || /<meta\s+[^>]*name=["']og:title["']/i.test(html);
  const hasOgDescription = /<meta\s+[^>]*property=["']og:description["']/i.test(html) || /<meta\s+[^>]*name=["']og:description["']/i.test(html);
  const hasOgImage = /<meta\s+[^>]*property=["']og:image["']/i.test(html) || /<meta\s+[^>]*name=["']og:image["']/i.test(html);

  const hasTwitterCard = /<meta\s+[^>]*name=["']twitter:card["']/i.test(html) || /<meta\s+[^>]*property=["']twitter:card["']/i.test(html);
  const hasJsonLd = /<script\s+[^>]*type=["']application\/ld\+json["']/i.test(html);

  // Score calculation (0 to 100)
  let score = 0;
  if (robotsOk) score += 15;
  if (sitemapOk && urlCount > 0) score += 20;
  else if (sitemapOk) score += 10;
  if (llmsOk && llmsHasContent) score += 10;
  if (faviconOk) score += 10;
  if (manifestOk) score += 5;
  if (hasCanonical) score += 15;
  if (hasOgTitle && hasOgDescription) score += 15;
  else if (hasOgTitle || hasOgDescription) score += 8;
  if (hasJsonLd) score += 10;

  const status: "ACTIVE" | "WARNING" | "FAIL" =
    score >= 75 ? "ACTIVE" : score >= 45 ? "WARNING" : "FAIL";

  const auditResult: DomainSeoAuditResult = {
    fqdn,
    checkedAt: new Date().toISOString(),
    score,
    status,
    robots: {
      ok: robotsOk,
      status: robotsRes.status,
      hasSitemap: hasSitemapInRobots,
    },
    sitemap: {
      ok: sitemapOk,
      status: sitemapRes.status,
      type: sitemapType,
      urlCount,
    },
    llms: {
      ok: llmsOk && llmsHasContent,
      status: llmsRes.status,
      hasContent: llmsHasContent,
    },
    favicon: {
      ok: faviconOk,
      status: faviconRes.status,
    },
    manifest: {
      ok: manifestOk,
      status: manifestRes.status,
    },
    homeHtml: {
      ok: homeOk,
      status: homeRes.status,
      canonical,
      hasCanonical,
      hasOgTitle,
      hasOgDescription,
      hasOgImage,
      hasTwitterCard,
      hasJsonLd,
    },
    error: homeRes.error || robotsRes.error || null,
  };

  // Save to database IntegrationConnection
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
      metadata: JSON.parse(JSON.stringify(auditResult)),
    },
    update: {
      status,
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      lastSyncError: auditResult.error || null,
      metadata: JSON.parse(JSON.stringify(auditResult)),
    },
  });

  return auditResult;
}

export async function runSeoAuditAllDomains() {
  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { fqdn: true },
  });

  const results: DomainSeoAuditResult[] = [];
  for (const d of domains) {
    try {
      const res = await runSeoAuditForDomain(d.fqdn);
      results.push(res);
    } catch (e) {
      console.error(`Erro ao auditar ${d.fqdn}:`, e);
    }
  }
  return results;
}
