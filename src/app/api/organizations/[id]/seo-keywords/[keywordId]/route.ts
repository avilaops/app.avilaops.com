import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function payload(body: Record<string, unknown> | null) {
  return {
    keyword: cleanText(body?.keyword, 180),
    intent: cleanText(body?.intent, 80) || null,
    locality: cleanText(body?.locality, 80) || null,
    priority: cleanText(body?.priority, 30) || "MEDIUM",
    estimatedVolume: cleanText(body?.estimatedVolume, 80) || null,
    recommendedPage: cleanText(body?.recommendedPage, 200) || null,
    status: cleanText(body?.status, 40) || "RECOMMENDED",
  };
}

async function getScopedKeyword(organizationId: string, keywordId: string) {
  return prisma.organizationSeoKeyword.findFirst({
    where: { id: keywordId, organizationId },
    select: { id: true, keyword: true },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keywordId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id, keywordId } = await params;
  const existing = await getScopedKeyword(id, keywordId);
  if (!existing) {
    return NextResponse.json({ error: "Palavra-chave não encontrada." }, { status: 404 });
  }

  const data = payload((await request.json().catch(() => null)) as Record<string, unknown> | null);
  if (data.keyword.length < 2) {
    return NextResponse.json({ error: "Informe a palavra-chave." }, { status: 400 });
  }

  const keyword = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.organizationSeoKeyword.update({
      where: { id: keywordId },
      data,
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: id,
        action: "ORGANIZATION_SEO_KEYWORD_UPDATED",
        entityType: "OrganizationSeoKeyword",
        entityId: updated.id,
        metadata: {
          previousKeyword: existing.keyword,
          keyword: updated.keyword,
          priority: updated.priority,
          status: updated.status,
        },
      },
    });

    return updated;
  });

  return NextResponse.json({ keyword });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keywordId: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id, keywordId } = await params;
  const existing = await getScopedKeyword(id, keywordId);
  if (!existing) {
    return NextResponse.json({ error: "Palavra-chave não encontrada." }, { status: 404 });
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.organizationSeoKeyword.delete({ where: { id: keywordId } });
    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: id,
        action: "ORGANIZATION_SEO_KEYWORD_DELETED",
        entityType: "OrganizationSeoKeyword",
        entityId: keywordId,
        metadata: { keyword: existing.keyword },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
