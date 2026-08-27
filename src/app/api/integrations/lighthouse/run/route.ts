import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { hasPageSpeedCredentials, runPageSpeedAuditForDomain } from "@/lib/pagespeed";
import { verifyServiceJwt } from "@/lib/service-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A varredura completa espaça as chamadas, então precisa de janela longa.
export const maxDuration = 900;

// O PageSpeed Insights limita por IP/chave. Sem espaçamento entre os domínios a
// varredura inteira volta 429 e nenhum domínio é medido de verdade.
const DELAY_BETWEEN_DOMAINS_MS = hasPageSpeedCredentials() ? 1500 : 12000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const result = await runPageSpeedAuditForDomain(fqdn);
      return NextResponse.json({ success: result.measured, result });
    }

    const domains = await prisma.domainAsset.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { fqdn: true },
    });

    const results = [];
    for (const [index, d] of domains.entries()) {
      if (index > 0) await sleep(DELAY_BETWEEN_DOMAINS_MS);
      const res = await runPageSpeedAuditForDomain(d.fqdn);
      results.push(res);
    }

    const measured = results.filter((r) => r.measured).length;

    return NextResponse.json({
      success: measured > 0,
      count: results.length,
      measured,
      failed: results.length - measured,
      hasCredentials: hasPageSpeedCredentials(),
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
