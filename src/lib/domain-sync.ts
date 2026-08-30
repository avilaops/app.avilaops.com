import { prisma } from "@/lib/prisma";
import { listDnsRecords, listZones } from "@/lib/cloudflare";

/**
 * Sufixos que não fazem parte do nome da marca. Lista curta de propósito: só
 * o que aparece na nossa carteira. Um `.com.br` tem dois rótulos de sufixo e
 * um `.com` tem um, e ignorar isso foi o que fez `comandeiro.com` e
 * `comandeiro.com.br` virarem dois clientes diferentes.
 */
const SUFIXOS = [
  "com.br", "net.br", "org.br", "app.br", "eco.br", "ind.br",
  "com", "net", "org", "app", "inc", "dev", "io", "co", "br",
  "beauty", "store", "love", "shop", "site", "online",
];

/**
 * O rótulo que identifica a marca: `comandeiro.com.br` e `comandeiro.com`
 * devolvem os dois `comandeiro`. É a chave que agrupa domínios do mesmo dono.
 */
export function chaveDaMarca(fqdn: string): string {
  const partes = fqdn.toLowerCase().split(".");
  while (partes.length > 1 && SUFIXOS.includes(partes.slice(1).join("."))) {
    partes.pop();
  }
  return partes[0] ?? fqdn.toLowerCase();
}

function deriveOrganizationName(fqdn: string): string {
  const label = chaveDaMarca(fqdn);
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
    // Se o domínio já foi sincronizado antes, respeita a organização atual
    // dele (que pode ter sido renomeada/mesclada manualmente) em vez de
    // recriar/reatribuir pelo slug do domínio a cada resincronização.
    const existingDomainAsset = await prisma.domainAsset.findUnique({
      where: { cloudflareZoneId: zone.id },
      select: { id: true, organizationId: true },
    });

    // Antes de criar cliente novo, procura um que já tenha um domínio da mesma
    // marca. Sem isso, cada extensão comprada pelo mesmo dono (`.com`, `.com.br`,
    // `.store`) abre uma ficha separada, e quem descobre é a pessoa que liga
    // para o cliente errado.
    const chave = chaveDaMarca(zone.name);
    const irmao = existingDomainAsset
      ? null
      : await prisma.domainAsset.findFirst({
          where: { fqdn: { startsWith: `${chave}.` } },
          select: { organizationId: true },
        });

    const organizationId = existingDomainAsset
      ? existingDomainAsset.organizationId
      : irmao
        ? irmao.organizationId
        : (
            await prisma.organization.upsert({
              where: { slug: chave },
              create: {
                name: deriveOrganizationName(zone.name),
                slug: chave,
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
