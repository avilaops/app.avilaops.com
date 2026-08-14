import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
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
    <AppShell adminName={admin.nome} section="seo">
      <header className="page-header operations-header">
        <div>
          <span className="eyebrow">Ávila OS · Domínios</span>
          <h1>Todo domínio no Cloudflare é um cliente.</h1>
          <p>
            Cada zona ativa no Cloudflare vira uma organização e um domínio
            aqui, com todos os registros de DNS espelhados — não é preciso
            cadastrar nada manualmente.
          </p>
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
    </AppShell>
  );
}
