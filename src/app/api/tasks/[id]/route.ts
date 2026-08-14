import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);

export async function PATCH(
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
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === "string" ? body.status.toUpperCase() : "";

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  try {
    const task = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.operationalTask.update({
        where: { id },
        data: {
          status,
          completedAt: status === "DONE" ? new Date() : null,
        },
      });

      await transaction.operationsAuditEvent.create({
        data: {
          actorId: admin.id,
          organizationId: updated.organizationId,
          action: "TASK_STATUS_CHANGED",
          entityType: "OperationalTask",
          entityId: updated.id,
          metadata: { status },
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, status: task.status });
  } catch {
    return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  }
}
