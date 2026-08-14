import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { submitIndexNowUrls } from "@/lib/indexnow";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let body: { fqdn?: unknown; urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const fqdn = cleanText(body.fqdn, 300);
  const urls = Array.isArray(body.urls)
    ? body.urls
        .map((url) => cleanText(url, 1000))
        .filter(Boolean)
    : undefined;

  if (!fqdn) {
    return NextResponse.json({ error: "Domínio não informado." }, { status: 400 });
  }

  try {
    const result = await submitIndexNowUrls({ fqdn, urls });

    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: result.ok ? "INDEXNOW_SUBMITTED" : "INDEXNOW_KEY_MISSING",
        entityType: "IntegrationConnection",
        entityId: result.connection.id,
        metadata: {
          fqdn,
          submitted: result.submitted,
          keyAudit: result.keyAudit,
          responseStatus: result.responseStatus,
        },
      },
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao enviar URLs ao IndexNow.";

    await prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "INDEXNOW_SUBMIT_FAILED",
        entityType: "IntegrationConnection",
        metadata: { fqdn, error: message },
      },
    });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
