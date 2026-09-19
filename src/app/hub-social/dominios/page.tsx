import { redirect } from "next/navigation";
import CloudflareDomainsPanel from "@/components/CloudflareDomainsPanel";
import { lerFiltro } from "@/components/dominios/tipos";
import { getAdmin } from "@/lib/auth";
import { PROVEDOR_REGISTRO_BR } from "@/lib/dominio-vencimento";
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

  // A leitura do Registro.br fica em integration_connections (uma linha por
  // fqdn), como já acontece com `domain_renewal` e `seo_audit`. O vencimento
  // em si é gravado na coluna `expires_at` do próprio domínio.
  const leiturasRegistroBr = await prisma.integrationConnection.findMany({
    where: { provider: PROVEDOR_REGISTRO_BR, siteUrl: { in: domains.map((domain) => domain.fqdn) } },
    select: { siteUrl: true, lastSyncedAt: true, metadata: true },
  });
  const porFqdn = new Map(leiturasRegistroBr.map((leitura) => [leitura.siteUrl, leitura]));

  return (
    <CloudflareDomainsPanel
      lidoEm={lidoEm}
      filtroInicial={lerFiltro(params.status)}
      initialDomains={domains.map((domain) => {
        const registroBr = porFqdn.get(domain.fqdn);
        const titular = (registroBr?.metadata as { titular?: unknown } | null)?.titular;

        return {
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
          registroBrLidoEm: registroBr?.lastSyncedAt?.toISOString() ?? null,
          registroBrTitular: typeof titular === "string" ? titular : null,
        };
      })}
    />
  );
}
