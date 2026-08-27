import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { readCampaignPayload } from "@/lib/newsletter-payload";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = readCampaignPayload(body);

  if (!payload.subject) {
    return NextResponse.json({ error: "Informe o assunto do e-mail." }, { status: 400 });
  }

  const campaign = await prisma.newsletterCampaign.create({
    data: {
      ...payload,
      name: payload.name || payload.subject,
      createdById: admin.id,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "NEWSLETTER_CAMPAIGN_CREATED",
      entityType: "NewsletterCampaign",
      entityId: campaign.id,
      metadata: { format: campaign.format, subject: campaign.subject },
    },
  });

  return NextResponse.json({ campaign });
}
