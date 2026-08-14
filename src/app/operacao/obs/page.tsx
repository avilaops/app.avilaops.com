import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import OsbDashboardClient, { OsbDomainRow } from "@/components/OsbDashboardClient";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function OsbDashboardPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const domains = await prisma.domainAsset.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      organization: { select: { name: true } },
      _count: { select: { dnsRecords: true } },
    },
    orderBy: { fqdn: "asc" },
  });

  const connections = await prisma.integrationConnection.findMany({
    where: {
      provider: {
        in: ["seo_audit", "lighthouse", "link_audit", "domain_renewal"],
      },
    },
  });

  const connectionMap = new Map<string, Record<string, unknown>>();
  for (const c of connections) {
    const key = `${c.provider}:${c.siteUrl}`;
    connectionMap.set(key, c.metadata as Record<string, unknown>);
  }

  const rows: OsbDomainRow[] = domains.map((domain) => {
    const fqdn = domain.fqdn;

    const seoMeta = connectionMap.get(`seo_audit:${fqdn}`) as { score?: number; status?: string } | undefined;
    const lightMeta = connectionMap.get(`lighthouse:${fqdn}`) as { performanceScore?: number; lcp?: string } | undefined;
    const linkMeta = connectionMap.get(`link_audit:${fqdn}`) as { brokenLinksCount?: number } | undefined;
    const renewMeta = connectionMap.get(`domain_renewal:${fqdn}`) as { daysRemaining?: number; needsRenewalNotice?: boolean } | undefined;

    const seoScore = seoMeta?.score ?? null;
    const perfScore = lightMeta?.performanceScore ?? null;
    const lcp = lightMeta?.lcp ?? "N/A";
    const brokenLinksCount = linkMeta?.brokenLinksCount ?? null;

    const now = new Date();
    const daysToExpire = domain.expiresAt
      ? Math.ceil((domain.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : renewMeta?.daysRemaining ?? null;

    const needsRenewal = Boolean(daysToExpire && daysToExpire <= 30);

    let overallHealth: "CRITICAL" | "WARNING" | "HEALTHY" = "HEALTHY";

    if (
      (seoScore !== null && seoScore < 45) ||
      (perfScore !== null && perfScore < 50) ||
      (brokenLinksCount !== null && brokenLinksCount > 2) ||
      (daysToExpire !== null && daysToExpire <= 14)
    ) {
      overallHealth = "CRITICAL";
    } else if (
      (seoScore !== null && seoScore < 75) ||
      (perfScore !== null && perfScore < 80) ||
      (brokenLinksCount !== null && brokenLinksCount > 0) ||
      needsRenewal
    ) {
      overallHealth = "WARNING";
    }

    return {
      id: domain.id,
      fqdn,
      organizationName: domain.organization.name || fqdn,
      cloudflareStatus: domain.cloudflareStatus ?? domain.status,
      dnsRecordsCount: domain._count.dnsRecords,
      seoScore,
      seoStatus: seoMeta?.status ?? "PENDING",
      perfScore,
      lcp,
      brokenLinksCount,
      daysToExpire,
      needsRenewal,
      overallHealth,
    };
  });

  return (
    <AppShell adminName={admin.nome} section="operations">
      <header className="page-header operations-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <span className="eyebrow">Ávila OS · Módulo OSB</span>
          <h1>Observabilidade & Saúde de Portfólio</h1>
          <p>
            Monitoramento unificado de Uptime, SEO Técnico, Performance Core Web Vitals, Integridade de Links e Vencimento de Domínios.
          </p>
        </div>
      </header>

      <OsbDashboardClient initialRows={rows} />
    </AppShell>
  );
}
