import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { publishBlockers } from "@/lib/job-postings";
import { prisma } from "@/lib/prisma";

/**
 * Coloca a vaga no ar.
 *
 * Aceita `DRAFT`, `PAUSED` e `CLOSED` — reabrir uma vaga encerrada é comum
 * quando a contratação cai. O que não muda é a validação: o mesmo conjunto de
 * campos que o JSON-LD do Google Jobs exige é conferido em toda entrada.
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
  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  const blockers = publishBlockers(posting);
  if (blockers.length > 0) {
    return NextResponse.json(
      { error: "A vaga ainda não pode ir ao ar.", blockers },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const saved = await transaction.jobPosting.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        // `publishedAt` é a primeira ida ao ar e não se reescreve: é ele que
        // distingue uma vaga nova de uma republicada, e o que congela o slug.
        publishedAt: posting.publishedAt ?? new Date(),
        closedAt: null,
      },
      select: { id: true, ref: true, slug: true, status: true, publishedAt: true },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "JOB_POSTING_PUBLISHED",
        entityType: "JobPosting",
        entityId: id,
        metadata: {
          ref: saved.ref,
          statusAnterior: posting.status,
          republicacao: posting.publishedAt !== null,
        },
      },
    });

    return saved;
  });

  return NextResponse.json({
    posting: updated,
    // O site é export estático: sem rebuild, a vaga existe no banco e não no ar.
    aviso: "Publique o site de vagas para a alteração aparecer em jobs.avilaops.com.",
  });
}
