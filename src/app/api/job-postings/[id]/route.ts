import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import {
  generateSlug,
  getJobPostingDetail,
  isExpired,
  publishBlockers,
  readPostingPayload,
  toBusinessDay,
} from "@/lib/job-postings";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const posting = await getJobPostingDetail(id);
  if (!posting) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    posting: {
      ...posting,
      postedAt: toBusinessDay(posting.postedAt),
      validThrough: toBusinessDay(posting.validThrough),
      expired: isExpired(posting),
      applicationCount: posting._count.applications,
      blockers: publishBlockers(posting),
    },
  });
}

export async function PUT(
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
    select: { id: true, slug: true, title: true, status: true, publishedAt: true },
  });
  if (!posting) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = readPostingPayload(body);

  if (payload.title.length < 3) {
    return NextResponse.json(
      { error: "Informe um título com pelo menos 3 caracteres." },
      { status: 400 },
    );
  }

  // Espelha exatamente o `CHECK job_postings_published_requires_dates`: sem
  // isto, limpar a data numa vaga no ar voltaria como erro cru do driver em vez
  // de uma frase que o operador entende.
  if (posting.status === "PUBLISHED" && (!payload.postedAt || !payload.validThrough)) {
    return NextResponse.json(
      {
        error:
          "Vaga no ar precisa manter data de publicação e data limite. Pause ou encerre antes de limpar as datas.",
      },
      { status: 400 },
    );
  }

  // O slug só muda enquanto a vaga nunca foi ao ar. Depois da primeira
  // publicação ele é o endereço que o Google Jobs já indexou e que o candidato
  // pode ter salvo — renomear em silêncio quebraria os dois.
  const slug =
    !posting.publishedAt && payload.title !== posting.title
      ? await generateSlug(payload.title, id)
      : posting.slug;

  const updated = await prisma.$transaction(async (transaction) => {
    const saved = await transaction.jobPosting.update({
      where: { id },
      data: { ...payload, slug },
      select: { id: true, ref: true, slug: true, title: true, status: true },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "JOB_POSTING_UPDATED",
        entityType: "JobPosting",
        entityId: id,
        metadata: {
          ref: saved.ref,
          slugChanged: slug !== posting.slug ? { de: posting.slug, para: slug } : null,
          status: saved.status,
        },
      },
    });

    return saved;
  });

  return NextResponse.json({ posting: updated });
}

export async function DELETE(
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
    select: { id: true, ref: true, title: true, _count: { select: { applications: true } } },
  });
  if (!posting) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  // O banco já recusaria (FK `RESTRICT`), mas com erro de driver. Aqui a recusa
  // vira uma explicação: vaga com gente inscrita se encerra, não se apaga.
  if (posting._count.applications > 0) {
    return NextResponse.json(
      {
        error: `Esta vaga tem ${posting._count.applications} candidatura(s) e não pode ser excluída. Encerre a vaga para tirá-la do ar mantendo o histórico.`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.jobPosting.delete({ where: { id } });
    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "JOB_POSTING_DELETED",
        entityType: "JobPosting",
        entityId: id,
        metadata: { ref: posting.ref, title: posting.title },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
