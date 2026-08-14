import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { submitBingForAllDomains, submitSitemapToBing } from "@/lib/bing-webmaster";
import { verifyServiceJwt } from "@/lib/service-auth";

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
      const result = await submitSitemapToBing(fqdn);
      return NextResponse.json({ success: result.success, result });
    }

    const results = await submitBingForAllDomains();
    return NextResponse.json({ success: results.ok, ...results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
