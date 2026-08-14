import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { saveSitemapAudit } from "@/lib/search-console";

export const runtime = "nodejs";

function domainFromSiteUrl(siteUrl: string) {
  return siteUrl.startsWith("sc-domain:") ? siteUrl.replace("sc-domain:", "") : "";
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let body: { fqdn?: unknown; siteUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const siteUrl = cleanText(body.siteUrl, 300);
  const fqdn = cleanText(body.fqdn, 300) || domainFromSiteUrl(siteUrl);
  if (!fqdn) {
    return NextResponse.json({ error: "Domínio não informado." }, { status: 400 });
  }

  const result = await saveSitemapAudit(fqdn);

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: result.audit.ok ? "SEO_SITEMAP_AUDITED" : "SEO_SITEMAP_AUDIT_FAILED",
      entityType: "IntegrationConnection",
      entityId: result.connection.id,
      metadata: {
        fqdn,
        audit: result.audit,
      },
    },
  });

  return NextResponse.json({
    ok: result.audit.ok,
    connection: result.connection,
    audit: result.audit,
  });
}
