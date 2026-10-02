import { NextRequest, NextResponse } from "next/server";
import { getAdminOuChave, rastroDaChave } from "@/lib/chaves-api";
import { cleanText, sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

/**
 * Marca nova depois do cadastro. Até aqui a marca só nascia junto com a
 * organização ("principal") — cliente com duas marcas não tinha como registrar
 * a segunda, e projeto/domínio ficavam pendurados na errada.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, erro } = await getAdminOuChave(request, "marcas:escrever");
  if (!admin) return NextResponse.json({ error: erro ?? "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = cleanText(body?.name, 120);
  const siteUrl = cleanText(body?.siteUrl, 300) || null;
  if (name.length < 2) return NextResponse.json({ error: "Informe o nome da marca." }, { status: 400 });

  const organizacao = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, brands: { select: { slug: true } } },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const usados = new Set(organizacao.brands.map((b) => b.slug));
  const base = slugify(name, 60) || "marca";
  let slug = base;
  let sufixo = 2;
  while (usados.has(slug)) {
    slug = `${base.slice(0, 56)}-${sufixo}`;
    sufixo += 1;
  }

  const marca = await prisma.brand.create({
    data: { organizationId: id, name, slug, siteUrl },
    select: { id: true, name: true, slug: true, siteUrl: true, status: true },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      action: "BRAND_CREATED",
      entityType: "Brand",
      entityId: marca.id,
      organizationId: id,
      actorId: admin.id,
      metadata: { ...rastroDaChave(admin), name, slug, siteUrl },
    },
  });

  return NextResponse.json({ ok: true, marca });
}
