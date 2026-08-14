import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const domains = await prisma.domainAsset.findMany({
    where: { cloudflareZoneId: { not: null } },
    include: {
      organization: { select: { name: true } },
      _count: { select: { dnsRecords: true } },
    },
    orderBy: { fqdn: "asc" },
  });

  return NextResponse.json({
    ok: true,
    domains: domains.map((domain) => ({
      id: domain.id,
      fqdn: domain.fqdn,
      cloudflarePlan: domain.cloudflarePlan,
      cloudflareStatus: domain.cloudflareStatus,
      dnsLastSyncedAt: domain.dnsLastSyncedAt,
      dnsRecordCount: domain._count.dnsRecords,
      organizationName: domain.organization.name,
    })),
  });
}
