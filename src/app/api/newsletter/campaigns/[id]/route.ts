import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { readCampaignPayload } from "@/lib/newsletter-payload";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  // Campanha enviada é registro do que saiu; editar apagaria a prova.
  if (campaign.status === "SENT" || campaign.status === "SENDING") {
    return NextResponse.json({ error: "Campanha em envio ou já enviada não pode ser editada." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = readCampaignPayload(body);
  if (!payload.subject) {
    return NextResponse.json({ error: "Informe o assunto do e-mail." }, { status: 400 });
  }

  const updated = await prisma.newsletterCampaign.update({
    where: { id },
    data: { ...payload, name: payload.name || payload.subject },
  });

  return NextResponse.json({ campaign: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  if (campaign.status === "SENT") {
    return NextResponse.json({ error: "Campanha enviada fica no histórico." }, { status: 409 });
  }

  await prisma.newsletterCampaign.delete({ where: { id } });
  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "NEWSLETTER_CAMPAIGN_DELETED",
      entityType: "NewsletterCampaign",
      entityId: id,
      metadata: { subject: campaign.subject },
    },
  });

  return NextResponse.json({ ok: true });
}
