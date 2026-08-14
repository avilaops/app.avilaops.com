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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const data = payload((await request.json().catch(() => null)) as Record<string, unknown> | null);
  if (data.keyword.length < 2) {
    return NextResponse.json({ error: "Informe a palavra-chave." }, { status: 400 });
  }

  const keyword = await prisma.$transaction(async (transaction) => {
    const created = await transaction.organizationSeoKeyword.create({
      data: { organizationId: id, ...data },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: id,
        action: "ORGANIZATION_SEO_KEYWORD_CREATED",
        entityType: "OrganizationSeoKeyword",
        entityId: created.id,
        metadata: { keyword: created.keyword, priority: created.priority, status: created.status },
      },
    });

    return created;
  });

  return NextResponse.json({ keyword }, { status: 201 });
}
