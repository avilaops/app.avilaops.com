import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/http";
import { internalSiteBaseUrl, internalSiteUrl, resolveInternalSubdomain } from "@/lib/internal-site";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = cleanText(body?.action, 20) || "publish";
  if (!["publish", "unpublish"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: { webPresence: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const subdomain = resolveInternalSubdomain(
    organization.webPresence?.internalSubdomain,
    organization.slug,
    organization.name,
  );
  if (!subdomain) {
    return NextResponse.json(
      { error: "Não foi possível gerar o endereço interno deste cliente." },
      { status: 400 },
    );
  }
  // Publicar sem host configurado gravaria PUBLISHED apontando para lugar
  // nenhum — o operador veria "no ar" e o cliente veria erro. Despublicar
  // continua valendo: é justamente como se tira do ar o que ficou órfão.
  if (action === "publish" && !internalSiteBaseUrl()) {
    return NextResponse.json(
      {
        error:
          "A página interna não tem endereço configurado. Defina INTERNAL_SITE_BASE_URL antes de publicar.",
      },
      { status: 409 },
    );
  }
  // Recalculado a cada publicação: se o subdomínio mudou no dossiê, o endereço
  // salvo antes está velho e apontaria para uma página que não existe mais.
  const internalUrl = internalSiteUrl(subdomain);

  const webPresence = await prisma.organizationWebPresence.upsert({
    where: { organizationId: id },
    create: {
      organizationId: id,
      internalSubdomain: subdomain,
      internalUrl,
      internalSiteStatus: action === "publish" ? "PUBLISHED" : "DRAFT",
      internalSitePublishedAt: action === "publish" ? new Date() : null,
    },
    update: {
      internalSubdomain: subdomain,
      internalUrl,
      internalSiteStatus: action === "publish" ? "PUBLISHED" : "DRAFT",
      internalSitePublishedAt: action === "publish" ? new Date() : null,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      organizationId: id,
      action: action === "publish" ? "ORGANIZATION_INTERNAL_SITE_PUBLISHED" : "ORGANIZATION_INTERNAL_SITE_UNPUBLISHED",
      entityType: "OrganizationWebPresence",
      entityId: webPresence.id,
      metadata: { internalUrl, internalSubdomain: subdomain },
    },
  });

  return NextResponse.json({
    ok: true,
    internalUrl,
    status: webPresence.internalSiteStatus,
  });
}
