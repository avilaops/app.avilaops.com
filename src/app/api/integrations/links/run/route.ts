import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { runLinkAuditForDomain } from "@/lib/link-checker";
import { verifyServiceJwt } from "@/lib/service-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  const service = verifyServiceJwt(req);
  const authHeader = req.headers.get("x-service-key") || req.headers.get("authorization");
  const secretKey = process.env.SERVICE_JWT_SECRET || process.env.SEO_AUDIT_API_KEY;

  const isAuthorized =
    Boolean(admin) ||
    Boolean(service) ||
    (secretKey && authHeader && authHeader.includes(secretKey));

  if (!isAuthorized) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const fqdn = typeof body?.fqdn === "string" ? body.fqdn.trim() : null;

    if (fqdn) {
      const result = await runLinkAuditForDomain(fqdn);
      return NextResponse.json({ success: true, result });
    }

    const domains = await prisma.domainAsset.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { fqdn: true },
    });

    const results = [];
    for (const d of domains) {
      const res = await runLinkAuditForDomain(d.fqdn);
      results.push(res);
    }

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
