import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { submitIndexNowForAllDomains } from "@/lib/indexnow";
import { isServiceCall, verifyServiceJwt } from "@/lib/service-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  const service = verifyServiceJwt(request);
  // O cron do n8n ("Rodada Diária") entra pelo x-service-key, como as outras
  // rotas de auditoria; o JWT continua valendo para quem já o usa.
  const servico = Boolean(service) || isServiceCall(request);

  if (!admin && !servico) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (admin && !sameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const result = await submitIndexNowForAllDomains({ limitPerDomain: 10000 });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin?.id ?? null,
      action: result.ok ? "INDEXNOW_ALL_SUBMITTED" : "INDEXNOW_ALL_PARTIAL",
      entityType: "IntegrationConnection",
      metadata: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        results: result.results,
        triggeredBy: admin ? "admin" : `service:${service?.iss ?? "n8n"}`,
      },
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
