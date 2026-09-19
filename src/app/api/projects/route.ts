import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ALLOWED_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    organizationId?: unknown;
    brandId?: unknown;
    title?: unknown;
    description?: unknown;
    url?: unknown;
    priority?: unknown;
    ownerName?: unknown;
    dueAt?: unknown;
  } | null;

  const organizationId = cleanText(body?.organizationId, 40);
  const brandId = cleanText(body?.brandId, 40);
  const title = cleanText(body?.title, 160);
  const description = cleanText(body?.description, 4000);
  const url = cleanText(body?.url, 500);
  const ownerName = cleanText(body?.ownerName, 100);
  const priorityInput = cleanText(body?.priority, 10).toUpperCase();
  const priority = ALLOWED_PRIORITIES.has(priorityInput) ? priorityInput : "MEDIUM";
  const dueAtValue = cleanText(body?.dueAt, 40);

  if (!organizationId) {
    return NextResponse.json({ error: "Selecione o cliente." }, { status: 400 });
  }
  if (title.length < 3) {
    return NextResponse.json(
      { error: "Informe um título com pelo menos 3 caracteres." },
      { status: 400 },
    );
  }

  // Link que não é http(s) não serve para nada aqui, e ainda abre espaço para
  // um `javascript:` ir parar num href da tela.
  if (url) {
    let esquema = "";
    try {
      esquema = new URL(url).protocol;
    } catch {
      esquema = "";
    }
    if (esquema !== "http:" && esquema !== "https:") {
      return NextResponse.json(
        { error: "Informe uma URL começando com http:// ou https://." },
        { status: 400 },
      );
    }
  }

  let dueAt: Date | null = null;
  if (dueAtValue) {
    const parsed = new Date(dueAtValue);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
    }
    dueAt = parsed;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      brands: brandId ? { where: { id: brandId }, select: { id: true } } : false,
    },
  });
  if (!organization) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }
  if (brandId && organization.brands?.length !== 1) {
    return NextResponse.json(
      { error: "Marca não pertence a este cliente." },
      { status: 400 },
    );
  }

  const project = await prisma.$transaction(async (transaction) => {
    const created = await transaction.project.create({
      data: {
        organizationId,
        brandId: brandId || null,
        title,
        description: description || null,
        url: url || null,
        priority,
        ownerName: ownerName || null,
        dueAt,
      },
      select: { id: true, title: true, status: true },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId,
        action: "PROJECT_CREATED",
        entityType: "Project",
        entityId: created.id,
        metadata: { title, priority },
      },
    });

    return created;
  });

  return NextResponse.json({ project }, { status: 201 });
}
