import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function priceToCents(value: unknown) {
  const text = cleanText(value, 30).replace(/\./g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const serviceType = cleanText(body?.serviceType, 80);
  const name = cleanText(body?.name, 160);
  const slug = slugify(cleanText(body?.slug, 100) || name);

  if (!serviceType || !name || !slug) {
    return NextResponse.json({ error: "Informe tipo, slug e nome do plano." }, { status: 400 });
  }

  const plan = await prisma.servicePlan.create({
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
      action: "SERVICE_PLAN_CREATED",
      entityType: "ServicePlan",
      entityId: plan.id,
      metadata: { slug: plan.slug, serviceType: plan.serviceType },
    },
  });

  return NextResponse.json({ plan }, { status: 201 });
}
