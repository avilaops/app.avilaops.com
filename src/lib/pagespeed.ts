import { prisma } from "@/lib/prisma";

const PROVIDER = "lighthouse";
const FETCH_TIMEOUT_MS = 25000;

export interface PageSpeedAuditResult {
  fqdn: string;
  checkedAt: string;
  performanceScore: number; // 0 to 100
  seoScore: number; // 0 to 100
  lcp: string; // e.g. "1.8 s"
  cls: string; // e.g. "0.02"
  inp: string; // e.g. "120 ms"
  status: "ACTIVE" | "WARNING" | "FAIL";
  error?: string | null;
}

export async function runPageSpeedAuditForDomain(fqdn: string): Promise<PageSpeedAuditResult> {
  const targetUrl = `https://${fqdn}`;
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    targetUrl,
  )}&category=PERFORMANCE&category=SEO&strategy=mobile`;

  try {
    const res = await fetch(apiUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Google PageSpeed API retornou status HTTP ${res.status}`);
    }

    const data = await res.json();
    const lighthouse = data.lighthouseResult;
    const categories = lighthouse?.categories ?? {};
    const audits = lighthouse?.audits ?? {};

    const performanceScore = Math.round((categories.performance?.score ?? 0) * 100);
    const seoScore = Math.round((categories.seo?.score ?? 0) * 100);

    const lcp = audits["largest-contentful-paint"]?.displayValue ?? "N/A";
    const cls = audits["cumulative-layout-shift"]?.displayValue ?? "N/A";
    const inp = audits["interaction-to-next-paint"]?.displayValue ?? "N/A";

    const status: "ACTIVE" | "WARNING" | "FAIL" =
      performanceScore >= 80 ? "ACTIVE" : performanceScore >= 50 ? "WARNING" : "FAIL";

    const auditResult: PageSpeedAuditResult = {
      fqdn,
      checkedAt: new Date().toISOString(),
      performanceScore,
      seoScore,
      lcp,
      cls,
      inp,
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    const fallbackResult: PageSpeedAuditResult = {
      fqdn,
      checkedAt: new Date().toISOString(),
      performanceScore: 0,
      seoScore: 0,
      lcp: "N/A",
      cls: "N/A",
      inp: "N/A",
      status: "FAIL",
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
        metadata: JSON.parse(JSON.stringify(fallbackResult)),
      },
      update: {
        status: "FAIL",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: errorMessage,
        metadata: JSON.parse(JSON.stringify(fallbackResult)),
      },
    });

    return fallbackResult;
  }
}
