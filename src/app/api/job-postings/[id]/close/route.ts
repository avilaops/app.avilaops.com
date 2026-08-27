import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Encerra a vaga. Sai do site no próximo build e as candidaturas permanecem —
 * é a saída correta para vaga preenchida ou cancelada, no lugar de excluir.
 */
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
  const posting = await prisma.jobPosting.findUnique({
    where: { id },
    select: { id: true, ref: true, status: true },
  });
  if (!posting) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }
  if (posting.status === "CLOSED") {
    return NextResponse.json({ error: "A vaga já está encerrada." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const saved = await transaction.jobPosting.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
      select: { id: true, ref: true, status: true, closedAt: true },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "JOB_POSTING_CLOSED",
        entityType: "JobPosting",
        entityId: id,
        metadata: { ref: saved.ref, statusAnterior: posting.status },
      },
    });

    return saved;
  });

  return NextResponse.json({
    posting: updated,
    aviso: "Publique o site de vagas para a alteração aparecer em jobs.avilaops.com.",
  });
}
