import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

function priceToCents(value: unknown) {
  const text = cleanText(value, 30).replace(/\./g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const serviceType = cleanText(body?.serviceType, 80);
  const name = cleanText(body?.name, 160);
  const slug = slugify(cleanText(body?.slug, 100) || name);

  if (!serviceType || !name || !slug) {
    return NextResponse.json({ error: "Informe tipo, slug e nome do plano." }, { status: 400 });
  }

  const plan = await prisma.servicePlan.update({
    where: { id },
    data: {
      serviceType,
      slug,
      name,
      description: cleanText(body?.description, 1000) || null,
      priceCents: priceToCents(body?.price),
      billingCycle: cleanText(body?.billingCycle, 40) || "ONE_TIME",
      status: cleanText(body?.status, 40) || "ACTIVE",
      sortOrder: Number(cleanText(body?.sortOrder, 12)) || 100,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "SERVICE_PLAN_UPDATED",
      entityType: "ServicePlan",
      entityId: plan.id,
      metadata: { slug: plan.slug, serviceType: plan.serviceType, status: plan.status },
    },
  });

  return NextResponse.json({ plan });
}
