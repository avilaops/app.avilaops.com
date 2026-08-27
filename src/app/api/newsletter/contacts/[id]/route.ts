import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const STATUSES = new Set(["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const status = cleanText(body?.status, 20).toUpperCase();
  const tags = cleanText(body?.tags, 200)
    .split(/[,;]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  if (status && !STATUSES.has(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const contact = await prisma.newsletterContact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const updated = await prisma.newsletterContact.update({
    where: { id },
    data: {
      ...(status
        ? {
            status,
            unsubscribedAt: status === "UNSUBSCRIBED" ? new Date() : null,
          }
        : {}),
      ...(body?.tags !== undefined ? { tags } : {}),
      ...(body?.name !== undefined ? { name: cleanText(body?.name, 160) || null } : {}),
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "NEWSLETTER_CONTACT_UPDATED",
      entityType: "NewsletterContact",
      entityId: id,
      metadata: { status: updated.status, email: updated.email },
    },
  });

  return NextResponse.json({ contact: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.newsletterContact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  await prisma.newsletterContact.delete({ where: { id } });
  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "NEWSLETTER_CONTACT_DELETED",
      entityType: "NewsletterContact",
      entityId: id,
      metadata: { email: contact.email },
    },
  });

  return NextResponse.json({ ok: true });
}
