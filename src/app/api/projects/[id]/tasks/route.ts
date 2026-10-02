import { NextRequest, NextResponse } from "next/server";
import { getAdminOuChave, rastroDaChave } from "@/lib/chaves-api";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ALLOWED_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, erro } = await getAdminOuChave(request, "projetos:escrever");
  if (!admin) {
    return NextResponse.json({ error: erro ?? "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true, brandId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    priority?: unknown;
    ownerName?: unknown;
    dueAt?: unknown;
  } | null;

  const title = cleanText(body?.title, 160);
  const ownerName = cleanText(body?.ownerName, 100);
  const priorityInput = cleanText(body?.priority, 10).toUpperCase();
  const priority = ALLOWED_PRIORITIES.has(priorityInput) ? priorityInput : "MEDIUM";
  const dueAtValue = cleanText(body?.dueAt, 40);

  if (title.length < 3) {
    return NextResponse.json(
      { error: "Informe um título com pelo menos 3 caracteres." },
      { status: 400 },
    );
  }

  let dueAt: Date | null = null;
  if (dueAtValue) {
    const parsed = new Date(dueAtValue);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
    }
    dueAt = parsed;
  }

  const task = await prisma.$transaction(async (transaction) => {
    const created = await transaction.operationalTask.create({
      data: {
        organizationId: project.organizationId,
        brandId: project.brandId,
        projectId: project.id,
        title,
        priority,
        ownerName: ownerName || null,
        dueAt,
      },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        organizationId: project.organizationId,
        action: "TASK_CREATED",
        entityType: "OperationalTask",
        entityId: created.id,
        metadata: { ...rastroDaChave(admin), title, priority, projectId: project.id },
      },
    });

    return created;
  });

  return NextResponse.json({ task }, { status: 201 });
}
