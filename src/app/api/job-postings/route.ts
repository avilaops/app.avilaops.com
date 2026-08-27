import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import {
  generateRef,
  generateSlug,
  isExpired,
  listJobPostings,
  readPostingPayload,
  toBusinessDay,
} from "@/lib/job-postings";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const postings = await listJobPostings({
    status: searchParams.get("status") ?? undefined,
    area: searchParams.get("area") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });

  return NextResponse.json({
    total: postings.length,
    postings: postings.map((posting) => ({
      id: posting.id,
      ref: posting.ref,
      slug: posting.slug,
      title: posting.title,
      area: posting.area,
      team: posting.team,
      location: posting.location,
      locationType: posting.locationType,
      contract: posting.contract,
      status: posting.status,
      postedAt: toBusinessDay(posting.postedAt),
      validThrough: toBusinessDay(posting.validThrough),
      expired: isExpired(posting),
      applicationCount: posting._count.applications,
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = readPostingPayload(body);

  if (payload.title.length < 3) {
    return NextResponse.json(
      { error: "Informe um título com pelo menos 3 caracteres." },
      { status: 400 },
    );
  }

  // A vaga nasce sempre em DRAFT: ir ao ar passa por `/publish`, que valida o
  // que o Google Jobs exige e registra a transição na auditoria.
  const [slug, ref] = await Promise.all([generateSlug(payload.title), generateRef()]);

  const posting = await prisma.$transaction(async (transaction) => {
    const created = await transaction.jobPosting.create({
      data: {
        ...payload,
        slug,
        ref,
        status: "DRAFT",
        createdById: admin.id,
      },
      select: { id: true, ref: true, slug: true, title: true, status: true },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "JOB_POSTING_CREATED",
        entityType: "JobPosting",
        entityId: created.id,
        metadata: { ref, slug, title: payload.title, area: payload.area },
      },
    });

    return created;
  });

  return NextResponse.json({ posting }, { status: 201 });
}
