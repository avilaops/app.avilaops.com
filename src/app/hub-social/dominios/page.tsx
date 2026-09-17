import { redirect } from "next/navigation";
import CloudflareDomainsPanel from "@/components/CloudflareDomainsPanel";
import { lerFiltro } from "@/components/dominios/tipos";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DominiosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const lidoEm = new Date().toISOString();
  const domains = await prisma.domainAsset.findMany({
    where: { cloudflareZoneId: { not: null } },
    include: {
      organization: { select: { id: true, name: true } },
      _count: { select: { dnsRecords: true } },
    },
    orderBy: { fqdn: "asc" },
  });

  return (
    <CloudflareDomainsPanel
      lidoEm={lidoEm}
      filtroInicial={lerFiltro(params.status)}
      initialDomains={domains.map((domain) => ({
        id: domain.id,
        fqdn: domain.fqdn,
        cloudflarePlan: domain.cloudflarePlan,
        cloudflareStatus: domain.cloudflareStatus,
        dnsLastSyncedAt: domain.dnsLastSyncedAt?.toISOString() ?? null,
        dnsRecordCount: domain._count.dnsRecords,
        organizationName: domain.organization.name,
        organizationId: domain.organization.id,
        cloudflareZoneId: domain.cloudflareZoneId,
        registrar: domain.registrar,
        expiresAt: domain.expiresAt?.toISOString() ?? null,
        autoRenew: domain.autoRenew,
        nextActionAt: domain.nextActionAt?.toISOString() ?? null,
      }))}
    />
  );
}
