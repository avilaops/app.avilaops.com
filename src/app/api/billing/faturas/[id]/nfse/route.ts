import { NextRequest, NextResponse } from "next/server";

import { ehDono, getAdmin } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { baixarXmlNfseDoErp, confirmarNfseManualNoErp, prepararNfseManualNoErp } from "@/lib/erp-nfse";
import { agendarEmissaoNfse } from "@/lib/fila-nfse";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

async function owner() { const admin = await getAdmin(); return admin && ehDono(admin.role) ? admin : null; }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: "Só o dono pode emitir NFS-e." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const invoice = await prisma.subscriptionInvoice.findUnique({ where: { id }, include: { organization: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } } });
  if (!invoice) return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
  if (invoice.status !== "PAID") return NextResponse.json({ error: "A NFS-e exige uma fatura paga." }, { status: 422 });
  if (!invoice.fiscalServiceCode || !invoice.fiscalDescription) return NextResponse.json({ error: "Preencha o código e a descrição fiscal da fatura." }, { status: 422 });
  const taxId = invoice.organization.cpfCnpj?.replace(/\D/g, "") ?? "";
  if (taxId.length !== 11 && taxId.length !== 14) return NextResponse.json({ error: "CPF ou CNPJ do cliente não cadastrado." }, { status: 422 });
  const dispatch = await agendarEmissaoNfse(id);
  const result = await prepararNfseManualNoErp({ idempotencyKey: dispatch.idempotencyKey, externalId: invoice.id, competenceDate: `${invoice.competence}-01`, amount: invoice.amount.toFixed(2), serviceCode: invoice.fiscalServiceCode, description: invoice.fiscalDescription, customer: { name: invoice.organization.legalName || invoice.organization.name, taxId, email: invoice.organization.contacts[0]?.email ?? undefined } });
  await prisma.$transaction([
    prisma.nfseDispatch.update({ where: { id: dispatch.id }, data: { status: "PENDING", issuanceMode: "MANUAL", erpIssuanceId: result.id, erpStatus: result.status, nextAttemptAt: null, lastError: result.reason ?? null } }),
    prisma.operationsAuditEvent.create({ data: { actorId: admin.id, organizationId: invoice.organizationId, action: "NFSE_MANUAL_PREPARADA", entityType: "SubscriptionInvoice", entityId: id, metadata: { dispatchId: dispatch.id, erpIssuanceId: result.id, portalUrl: result.portalUrl } } }),
  ]);
  return NextResponse.json({ dispatch: await prisma.nfseDispatch.findUnique({ where: { invoiceId: id } }), portalUrl: result.portalUrl }, { status: 201 });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: "Só o dono pode confirmar NFS-e." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const { id } = await params;
  const dispatch = await prisma.nfseDispatch.findUnique({ where: { invoiceId: id }, include: { invoice: { select: { organizationId: true } } } });
  if (!dispatch?.erpIssuanceId || dispatch.erpStatus !== "pending") return NextResponse.json({ error: "Prepare a emissão manual antes de importar o XML." }, { status: 409 });
  const form = await request.formData();
  const file = form.get("xml");
  if (!(file instanceof File) || !file.size || file.size > 1_048_576) return NextResponse.json({ error: "Selecione o XML da NFS-e com até 1 MiB." }, { status: 422 });
  const xml = await file.text();
  const result = await confirmarNfseManualNoErp(dispatch.erpIssuanceId, randomUUID(), xml);
  await prisma.$transaction([
    prisma.nfseDispatch.update({ where: { id: dispatch.id }, data: { status: "ISSUED", erpStatus: result.status, accessKey: result.accessKey ?? null, issuedAt: new Date(), nextAttemptAt: null, lastError: result.reason ?? null } }),
    prisma.operationsAuditEvent.create({ data: { actorId: admin.id, organizationId: dispatch.invoice.organizationId, action: "NFSE_MANUAL_CONFIRMADA", entityType: "SubscriptionInvoice", entityId: id, metadata: { dispatchId: dispatch.id, erpIssuanceId: dispatch.erpIssuanceId, accessKey: result.accessKey } } }),
  ]);
  return NextResponse.json({ dispatch: await prisma.nfseDispatch.findUnique({ where: { invoiceId: id } }) });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await owner()) return NextResponse.json({ error: "Só o dono pode baixar a NFS-e." }, { status: 403 });
  const { id } = await params;
  const dispatch = await prisma.nfseDispatch.findUnique({ where: { invoiceId: id } });
  if (!dispatch?.erpIssuanceId || dispatch.status !== "ISSUED") return NextResponse.json({ error: "NFS-e emitida não encontrada." }, { status: 404 });
  const xml = await baixarXmlNfseDoErp(dispatch.erpIssuanceId);
  return new NextResponse(xml, { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="nfse-${id}.xml"`, "cache-control": "private, no-store" } });
}
