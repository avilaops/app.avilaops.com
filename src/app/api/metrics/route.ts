import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Prometheus scrapes this on a fixed interval — history accumulates in
// Prometheus's own TSDB from repeated scrapes, no history table needed here.
// Auth is a static bearer token (not verifyServiceJwt) because Prometheus's
// scrape_configs only support a fixed credential, not per-request JWT minting.
function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.METRICS_BEARER_TOKEN?.trim();
  if (!configured) return false;

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${configured}`;
}

const SEO_AUDIT_PROVIDER = "seo_audit";
const LIGHTHOUSE_PROVIDER = "lighthouse";
const LINK_AUDIT_PROVIDER = "link_audit";
const BING_WEBMASTER_PROVIDER = "bing_webmaster";
const DOMAIN_RENEWAL_PROVIDER = "domain_renewal";
const INDEXNOW_PROVIDER = "indexnow";
const GSC_PROVIDER = "google_search_console";

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseMetricSeconds(display: unknown): number | null {
  if (typeof display !== "string") return null;
  const match = display.trim().match(/^([\d.]+)\s*(ms|s)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === "ms" ? value / 1000 : value;
}

function parseUnitless(display: unknown): number | null {
  if (typeof display !== "string") return null;
  const value = Number(display.trim());
  return Number.isFinite(value) ? value : null;
}

function syncStatusValue(status: string | null): number {
  return status === "SUCCESS" ? 1 : 0;
}

class MetricsWriter {
  private lines: string[] = [];
  private declaredHelp = new Set<string>();

  gauge(name: string, help: string, value: number, labels: Record<string, string> = {}) {
    if (!this.declaredHelp.has(name)) {
      this.lines.push(`# HELP ${name} ${help}`);
      this.lines.push(`# TYPE ${name} gauge`);
      this.declaredHelp.add(name);
    }
    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
      .join(",");
    const labelStr = labelPairs ? `{${labelPairs}}` : "";
    this.lines.push(`${name}${labelStr} ${value}`);
  }

  toString() {
    return this.lines.join("\n") + "\n";
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const [domains, connections] = await Promise.all([
    prisma.domainAsset.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { fqdn: true },
      orderBy: { fqdn: "asc" },
    }),
    prisma.integrationConnection.findMany({
      where: {
        provider: {
          in: [
            SEO_AUDIT_PROVIDER,
            LIGHTHOUSE_PROVIDER,
            LINK_AUDIT_PROVIDER,
            BING_WEBMASTER_PROVIDER,
            DOMAIN_RENEWAL_PROVIDER,
            INDEXNOW_PROVIDER,
            GSC_PROVIDER,
          ],
        },
      },
    }),
  ]);

  const byProviderAndFqdn = new Map(
    connections.map((connection) => [`${connection.provider}::${connection.siteUrl}`, connection]),
  );

  const metrics = new MetricsWriter();

  for (const { fqdn } of domains) {
    const labels = { fqdn };

    const seoAudit = byProviderAndFqdn.get(`${SEO_AUDIT_PROVIDER}::${fqdn}`);
    if (seoAudit) {
      const meta = seoAudit.metadata as { score?: number } | null;
      if (typeof meta?.score === "number") {
        metrics.gauge("avilaops_seo_audit_score", "Score de auditoria técnica de SEO (0-100)", meta.score, labels);
      }
      metrics.gauge(
        "avilaops_seo_audit_last_run_success",
        "Se a última auditoria de SEO técnico teve sucesso (1) ou falhou (0)",
        syncStatusValue(seoAudit.lastSyncStatus),
        labels,
      );
      if (seoAudit.lastSyncedAt) {
        metrics.gauge(
          "avilaops_seo_audit_last_run_timestamp_seconds",
          "Unix timestamp da última auditoria de SEO técnico",
          Math.floor(seoAudit.lastSyncedAt.getTime() / 1000),
          labels,
        );
      }
    }

    const lighthouse = byProviderAndFqdn.get(`${LIGHTHOUSE_PROVIDER}::${fqdn}`);
    if (lighthouse) {
      const meta = lighthouse.metadata as {
        performanceScore?: number;
        seoScore?: number;
        lcp?: string;
        cls?: string;
        inp?: string;
      } | null;

      if (typeof meta?.performanceScore === "number") {
        metrics.gauge(
          "avilaops_pagespeed_performance_score",
          "Score de performance do PageSpeed Insights (0-100)",
          meta.performanceScore,
          labels,
        );
      }
      if (typeof meta?.seoScore === "number") {
        metrics.gauge(
          "avilaops_pagespeed_seo_score",
          "Score de SEO do PageSpeed Insights (0-100)",
          meta.seoScore,
          labels,
        );
      }
      const lcpSeconds = parseMetricSeconds(meta?.lcp);
      if (lcpSeconds !== null) {
        metrics.gauge("avilaops_pagespeed_lcp_seconds", "Largest Contentful Paint em segundos", lcpSeconds, labels);
      }
      const clsValue = parseUnitless(meta?.cls);
      if (clsValue !== null) {
        metrics.gauge("avilaops_pagespeed_cls", "Cumulative Layout Shift", clsValue, labels);
      }
      const inpSeconds = parseMetricSeconds(meta?.inp);
      if (inpSeconds !== null) {
        metrics.gauge("avilaops_pagespeed_inp_seconds", "Interaction to Next Paint em segundos", inpSeconds, labels);
      }
      metrics.gauge(
        "avilaops_pagespeed_last_run_success",
        "Se a última execução do PageSpeed teve sucesso (1) ou falhou (0)",
        syncStatusValue(lighthouse.lastSyncStatus),
        labels,
      );
    }

    const linkAudit = byProviderAndFqdn.get(`${LINK_AUDIT_PROVIDER}::${fqdn}`);
    if (linkAudit) {
      const meta = linkAudit.metadata as { brokenLinksCount?: number } | null;
      if (typeof meta?.brokenLinksCount === "number") {
        metrics.gauge(
          "avilaops_broken_links_count",
          "Quantidade de links quebrados encontrados na home do domínio",
          meta.brokenLinksCount,
          labels,
        );
      }
    }

    const bing = byProviderAndFqdn.get(`${BING_WEBMASTER_PROVIDER}::${fqdn}`);
    if (bing) {
      metrics.gauge(
        "avilaops_bing_submit_last_run_success",
        "Se o último envio ao Bing Webmaster teve sucesso (1) ou falhou (0)",
        syncStatusValue(bing.lastSyncStatus),
        labels,
      );
    }

    const indexNow = byProviderAndFqdn.get(`${INDEXNOW_PROVIDER}::${fqdn}`);
    if (indexNow) {
      metrics.gauge(
        "avilaops_indexnow_submit_last_run_success",
        "Se o último envio ao IndexNow teve sucesso (1) ou falhou (0)",
        syncStatusValue(indexNow.lastSyncStatus),
        labels,
      );
    }

    const gsc = byProviderAndFqdn.get(`${GSC_PROVIDER}::${fqdn}`);
    metrics.gauge(
      "avilaops_search_console_connected",
      "Se o domínio está conectado ao Google Search Console (1) ou não (0)",
      gsc ? 1 : 0,
      labels,
    );

    const renewal = byProviderAndFqdn.get(`${DOMAIN_RENEWAL_PROVIDER}::${fqdn}`);
    if (renewal) {
      const meta = renewal.metadata as { daysRemaining?: number | null; needsRenewalNotice?: boolean } | null;
      if (typeof meta?.daysRemaining === "number") {
        metrics.gauge(
          "avilaops_domain_expiry_days_remaining",
          "Dias restantes até a expiração do domínio",
          meta.daysRemaining,
          labels,
        );
      }
      metrics.gauge(
        "avilaops_domain_needs_renewal_notice",
        "Se o domínio precisa de aviso de renovação (1) ou não (0)",
        meta?.needsRenewalNotice ? 1 : 0,
        labels,
      );
    }
  }

  return new NextResponse(metrics.toString(), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
