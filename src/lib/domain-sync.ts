import { prisma } from "@/lib/prisma";
import { listDnsRecords, listZones } from "@/lib/cloudflare";

function deriveOrganizationName(fqdn: string): string {
  const label = fqdn.split(".")[0] ?? fqdn;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type DomainSyncResult = {
  domain: string;
  organizationId: string;
  domainAssetId: string;
  dnsRecordCount: number;
};

export async function syncCloudflareDomains(actorId: string): Promise<DomainSyncResult[]> {
  const zones = await listZones();
  const results: DomainSyncResult[] = [];

  for (const zone of zones) {
    const slug = zone.name.toLowerCase();

    // Se o domínio já foi sincronizado antes, respeita a organização atual
    // dele (que pode ter sido renomeada/mesclada manualmente) em vez de
    // recriar/reatribuir pelo slug do domínio a cada resincronização.
    const existingDomainAsset = await prisma.domainAsset.findUnique({
      where: { cloudflareZoneId: zone.id },
      select: { id: true, organizationId: true },
    });

    const organizationId = existingDomainAsset
      ? existingDomainAsset.organizationId
      : (
          await prisma.organization.upsert({
            where: { slug },
            create: {
              name: deriveOrganizationName(zone.name),
              slug,
              siteUrl: `https://${zone.name}`,
              status: "ONBOARDING",
            },
            update: {},
          })
        ).id;

    const domainAsset = await prisma.domainAsset.upsert({
      where: { cloudflareZoneId: zone.id },
      create: {
        organizationId,
        fqdn: zone.name,
        cloudflareZoneId: zone.id,
        cloudflarePlan: zone.plan.name,
        cloudflareStatus: zone.status,
        dnsLastSyncedAt: new Date(),
      },
      update: {
        cloudflarePlan: zone.plan.name,
        cloudflareStatus: zone.status,
        dnsLastSyncedAt: new Date(),
      },
    });

    const dnsRecords = await listDnsRecords(zone.id);

    for (const record of dnsRecords) {
      await prisma.dnsRecord.upsert({
        where: { cloudflareRecordId: record.id },
        create: {
          domainAssetId: domainAsset.id,
          cloudflareRecordId: record.id,
          type: record.type,
          name: record.name,
          content: record.content,
          proxied: record.proxied,
          ttl: record.ttl,
          priority: record.priority ?? null,
        },
        update: {
          type: record.type,
          name: record.name,
          content: record.content,
          proxied: record.proxied,
          ttl: record.ttl,
          priority: record.priority ?? null,
        },
      });
    }

    // Remove registros que sumiram do Cloudflare desde a última sincronização.
    const currentIds = dnsRecords.map((record) => record.id);
    await prisma.dnsRecord.deleteMany({
      where: {
        domainAssetId: domainAsset.id,
        cloudflareRecordId: { notIn: currentIds.length > 0 ? currentIds : ["__none__"] },
      },
    });

    results.push({
      domain: zone.name,
      organizationId,
      domainAssetId: domainAsset.id,
      dnsRecordCount: dnsRecords.length,
    });
  }

  await prisma.operationsAuditEvent.create({
    data: {
      actorId,
      action: "CLOUDFLARE_DOMAINS_SYNCED",
      entityType: "DomainAsset",
      metadata: { zoneCount: zones.length, domains: results.map((r) => r.domain) },
    },
  });

  return results;
}
