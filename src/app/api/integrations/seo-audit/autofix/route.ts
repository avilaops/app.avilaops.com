import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { generateAndApplySeoAutoFix } from "@/lib/seo-autofix";
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
    const body = await req.json();
    const fqdn = typeof body?.fqdn === "string" ? body.fqdn.trim() : null;

    if (!fqdn) {
      return NextResponse.json({ error: "Campo fqdn é obrigatório." }, { status: 400 });
    }

    const result = await generateAndApplySeoAutoFix(fqdn);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
