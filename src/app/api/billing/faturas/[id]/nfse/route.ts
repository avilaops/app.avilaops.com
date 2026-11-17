import { NextRequest, NextResponse } from "next/server";

import { ehDono, getAdmin } from "@/lib/auth";
import { baixarXmlNfseDoErp } from "@/lib/erp-nfse";
import { agendarEmissaoNfse, processarFilaNfse } from "@/lib/fila-nfse";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

async function owner() { const admin = await getAdmin(); return admin && ehDono(admin.role) ? admin : null; }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: "Só o dono pode emitir NFS-e." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const invoice = await prisma.subscriptionInvoice.findUnique({ where: { id }, select: { status: true, fiscalServiceCode: true, fiscalDescription: true } });
  if (!invoice) return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
  if (invoice.status !== "PAID") return NextResponse.json({ error: "A NFS-e exige uma fatura paga." }, { status: 422 });
  if (!invoice.fiscalServiceCode || !invoice.fiscalDescription) return NextResponse.json({ error: "Preencha o código e a descrição fiscal da fatura." }, { status: 422 });
  const dispatch = await agendarEmissaoNfse(id);
  await prisma.operationsAuditEvent.create({ data: { actorId: admin.id, organizationId: (await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id }, select: { organizationId: true } })).organizationId, action: "NFSE_EMISSAO_SOLICITADA", entityType: "SubscriptionInvoice", entityId: id, metadata: { dispatchId: dispatch.id, manual: true } } });
  const summary = await processarFilaNfse(new Date(), 10);
  return NextResponse.json({ dispatch: await prisma.nfseDispatch.findUnique({ where: { invoiceId: id } }), summary }, { status: 202 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await owner()) return NextResponse.json({ error: "Só o dono pode baixar a NFS-e." }, { status: 403 });
  const { id } = await params;
  const dispatch = await prisma.nfseDispatch.findUnique({ where: { invoiceId: id } });
  if (!dispatch?.erpIssuanceId || dispatch.status !== "ISSUED") return NextResponse.json({ error: "NFS-e emitida não encontrada." }, { status: 404 });
  const xml = await baixarXmlNfseDoErp(dispatch.erpIssuanceId);
  return new NextResponse(xml, { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="nfse-${id}.xml"`, "cache-control": "private, no-store" } });
}
