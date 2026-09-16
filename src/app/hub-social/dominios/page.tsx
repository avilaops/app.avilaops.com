import { redirect } from "next/navigation";
import CloudflareDomainsPanel from "@/components/CloudflareDomainsPanel";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DominiosPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const domains = await prisma.domainAsset.findMany({
    where: { cloudflareZoneId: { not: null } },
    include: {
      organization: { select: { name: true } },
      _count: { select: { dnsRecords: true } },
    },
    orderBy: { fqdn: "asc" },
  });

  return (
    <>
      <header className="page-header operations-header">
        <div>
          <h1>Domínios</h1>
          <p>Cada zona do Cloudflare vira uma organização e um domínio aqui, com o DNS espelhado.</p>
        </div>
      </header>

      <section className="operations-grid">
        <CloudflareDomainsPanel
          initialDomains={domains.map((domain) => ({
            id: domain.id,
            fqdn: domain.fqdn,
            cloudflarePlan: domain.cloudflarePlan,
            cloudflareStatus: domain.cloudflareStatus,
            dnsLastSyncedAt: domain.dnsLastSyncedAt?.toISOString() ?? null,
            dnsRecordCount: domain._count.dnsRecords,
            organizationName: domain.organization.name,
          }))}
        />
      </section>
    </>
  );
}
