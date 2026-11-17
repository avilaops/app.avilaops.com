import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { ehDono, getAdmin } from "@/lib/auth";
import { cancelarNfseNoErp } from "@/lib/erp-nfse";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin || !ehDono(admin.role)) return NextResponse.json({ error: "Só o dono pode cancelar NFS-e." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const reason = cleanText(body?.reason, 500);
  if (reason.length < 15) return NextResponse.json({ error: "Informe uma justificativa com ao menos 15 caracteres." }, { status: 422 });
  const dispatch = await prisma.nfseDispatch.findUnique({ where: { invoiceId: id }, include: { invoice: { select: { organizationId: true } } } });
  if (!dispatch?.erpIssuanceId || dispatch.status !== "ISSUED") return NextResponse.json({ error: "NFS-e emitida não encontrada." }, { status: 404 });
  const result = await cancelarNfseNoErp(dispatch.erpIssuanceId, randomUUID(), reason);
  await prisma.$transaction([
    prisma.nfseDispatch.update({ where: { id: dispatch.id }, data: { status: result.status === "CANCELLED" ? "CANCELLED" : "UNCERTAIN", erpStatus: result.status, cancelledAt: result.status === "CANCELLED" ? new Date() : null, lastError: result.reason ?? null } }),
    prisma.operationsAuditEvent.create({ data: { actorId: admin.id, organizationId: dispatch.invoice.organizationId, action: "NFSE_CANCELAMENTO_SOLICITADO", entityType: "SubscriptionInvoice", entityId: id, metadata: { dispatchId: dispatch.id, reason, erpStatus: result.status } } }),
  ]);
  return NextResponse.json({ ok: true, status: result.status });
}
