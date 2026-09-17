import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import OsbDashboardClient, { OsbDomainRow } from "@/components/OsbDashboardClient";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ConnectionSnapshot = {
  metadata: Record<string, unknown> | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncedAt: Date | null;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

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

  const connectionMap = new Map<string, ConnectionSnapshot>();
  for (const c of connections) {
    connectionMap.set(`${c.provider}:${c.siteUrl}`, {
      metadata: c.metadata as Record<string, unknown> | null,
      lastSyncStatus: c.lastSyncStatus,
      lastSyncError: c.lastSyncError,
      lastSyncedAt: c.lastSyncedAt,
    });
  }

  const rows: OsbDomainRow[] = domains.map((domain) => {
    const fqdn = domain.fqdn;

    const seoConn = connectionMap.get(`seo_audit:${fqdn}`);
    const lightConn = connectionMap.get(`lighthouse:${fqdn}`);
    const linkConn = connectionMap.get(`link_audit:${fqdn}`);
    const renewConn = connectionMap.get(`domain_renewal:${fqdn}`);

    // Uma coleta que falhou não é uma medição: vira "sem dados", nunca 0/100.
    // `measured` é o campo novo; registros antigos são reconhecidos pelo lastSyncStatus.
    const perfMeasured =
      lightConn !== undefined &&
      lightConn.metadata?.measured !== false &&
      !(lightConn.metadata?.measured === undefined && lightConn.lastSyncStatus === "ERROR");

    const seoScore = num(seoConn?.metadata?.score);
    const perfScore = perfMeasured ? num(lightConn?.metadata?.performanceScore) : null;
    const lcp = perfScore !== null ? (lightConn?.metadata?.lcp as string | null) ?? null : null;
    const brokenLinksCount = num(linkConn?.metadata?.brokenLinksCount);

    const perfError = perfScore === null ? lightConn?.lastSyncError ?? null : null;
    const seoError = seoConn?.lastSyncError ?? null;

    const now = new Date();
    const daysToExpire = domain.expiresAt
      ? Math.ceil((domain.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : num(renewConn?.metadata?.daysRemaining);

    const needsRenewal = daysToExpire !== null && daysToExpire <= 30;

    const critical =
      (seoScore !== null && seoScore < 45) ||
      (perfScore !== null && perfScore < 50) ||
      (brokenLinksCount !== null && brokenLinksCount > 2) ||
      (daysToExpire !== null && daysToExpire <= 14);

    const warning =
      (seoScore !== null && seoScore < 75) ||
      (perfScore !== null && perfScore < 80) ||
      (brokenLinksCount !== null && brokenLinksCount > 0) ||
      needsRenewal;

    const measuredSignals = [seoScore, perfScore, brokenLinksCount, daysToExpire].filter((v) => v !== null).length;

    let overallHealth: OsbDomainRow["overallHealth"];
    if (critical) overallHealth = "CRITICAL";
    else if (warning) overallHealth = "WARNING";
    else if (measuredSignals === 0) overallHealth = "UNKNOWN";
    else overallHealth = "HEALTHY";

    return {
      id: domain.id,
      fqdn,
      organizationName: domain.organization.name || fqdn,
      cloudflareStatus: domain.cloudflareStatus ?? domain.status,
      dnsRecordsCount: domain._count.dnsRecords,
      seoScore,
      seoStatus: (seoConn?.metadata?.status as string | undefined) ?? "PENDING",
      seoError,
      perfScore,
      perfError,
      perfCheckedAt: lightConn?.lastSyncedAt ? lightConn.lastSyncedAt.toISOString() : null,
      lcp,
      brokenLinksCount,
      daysToExpire,
      needsRenewal,
      overallHealth,
    };
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="operations">
      <header className="page-header">
        <div>
          <h1>Observabilidade</h1>
          <p>Uptime, SEO técnico, Core Web Vitals, links quebrados e vencimento de domínio.</p>
        </div>
      </header>

      <OsbDashboardClient initialRows={rows} />
    </AppShell>
  );
}
