import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Diz de quem é uma loja que já existe na plataforma.
 *
 * Até aqui o vínculo só nascia pelo botão "Criar loja" da ficha do cliente:
 * loja criada por fora — direto na plataforma, pelo n8n, ou antes daquele
 * fluxo existir — ficava para sempre sem dono, e não havia tela que
 * consertasse depois. A área de Lojas encontra essas órfãs; esta rota é como
 * elas param de ser.
 *
 * **Quem decide é gente.** A tela sugere um cliente pelo slug e pelo nome, mas
 * a sugestão não vira gravação sozinha: este POST só chega aqui com um
 * `organizationId` que alguém confirmou. O vínculo decide de quem é a receita
 * e para quem vai a cobrança — errar calado é pior que ficar em branco.
 */
type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { slug } = await params;
  const corpo = (await request.json().catch(() => null)) as { organizationId?: unknown } | null;
  const organizationId = typeof corpo?.organizationId === "string" ? corpo.organizationId.trim() : "";
  if (!organizationId) return NextResponse.json({ error: "Escolha o cliente." }, { status: 422 });

  const organizacao = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  // Uma loja tem um dono só. Se outra ficha já reivindicou este slug, a troca
  // é decisão de gente com o histórico na mão — não acontece por um toque.
  const jaVinculada = await prisma.organizationIntegration.findFirst({
    where: { provider: "lojas_avilaops", publicId: slug, NOT: { organizationId } },
    select: { organization: { select: { name: true } } },
  });
  if (jaVinculada) {
    return NextResponse.json(
      { error: `A loja "${slug}" já está vinculada a ${jaVinculada.organization.name}.` },
      { status: 409 },
    );
  }

  await prisma.organizationIntegration.upsert({
    where: { organizationId_provider: { organizationId: organizacao.id, provider: "lojas_avilaops" } },
    create: {
      organizationId: organizacao.id,
      provider: "lojas_avilaops",
      publicId: slug,
      accountName: slug,
      status: "ACTIVE",
      notes: "Vinculada pela área de Lojas a uma loja que já existia na plataforma.",
    },
    update: { publicId: slug, status: "ACTIVE" },
  });

  // Quem ligou a loja a este cliente, e quando. A conciliação segue a mesma
  // regra; um vínculo que muda de dono sem rastro é pior que nenhum.
  await prisma.operationsAuditEvent.create({
    data: {
      action: "STORE_LINKED",
      entityType: "Organization",
      entityId: organizacao.id,
      organizationId: organizacao.id,
      actorId: admin.id,
      metadata: { slug, origem: "area-de-lojas" },
    },
  });

  return NextResponse.json({ slug, cliente: { id: organizacao.id, nome: organizacao.name } });
}
