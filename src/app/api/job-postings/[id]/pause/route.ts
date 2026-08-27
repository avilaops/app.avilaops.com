import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Tira a vaga do ar sem encerrá-la.
 *
 * Existe porque parar de receber candidatura e desistir da contratação são
 * coisas diferentes: pausada, a vaga some do próximo build do site e volta com
 * um clique, mantendo datas, conteúdo e candidaturas.
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
  if (posting.status !== "PUBLISHED") {
    return NextResponse.json(
      { error: "Só é possível pausar uma vaga que está no ar." },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const saved = await transaction.jobPosting.update({
      where: { id },
      data: { status: "PAUSED" },
      select: { id: true, ref: true, status: true },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "JOB_POSTING_PAUSED",
        entityType: "JobPosting",
        entityId: id,
        metadata: { ref: saved.ref },
      },
    });

    return saved;
  });

  return NextResponse.json({
    posting: updated,
    aviso: "Publique o site de vagas para a alteração aparecer em jobs.avilaops.com.",
  });
}
