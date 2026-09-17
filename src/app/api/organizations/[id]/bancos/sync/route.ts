import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { catalogoSchema, sincronizarCatalogo } from "@/lib/banco-cliente";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isServiceCall } from "@/lib/service-auth";

/**
 * Recebe o catálogo do banco do cliente. Quem chama é um script numa máquina
 * com acesso à rede do cliente (`x-service-key`) — o Ávila OS não alcança esse
 * banco. `:id` aceita o id ou o slug da organização, porque o script conhece
 * o cliente pelo nome, não pelo cuid.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const servico = isServiceCall(request);
  const admin = servico ? null : await getAdmin();
  if (!servico) {
    if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const organizacao = await prisma.organization.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true },
  });
  if (!organizacao) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const lido = catalogoSchema.safeParse(await request.json().catch(() => null));
  if (!lido.success) {
    return NextResponse.json(
      {
        error: "Catálogo inválido.",
        problemas: lido.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  const resumo = await sincronizarCatalogo(organizacao.id, lido.data);

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin?.id ?? null,
      organizationId: organizacao.id,
      action: "CLIENT_DATABASE_SYNCED",
      entityType: "ClientDatabase",
      entityId: resumo.databaseId,
      metadata: {
        key: lido.data.key,
        environment: lido.data.environment,
        databaseName: lido.data.databaseName,
        syncedFrom: lido.data.syncedFrom ?? null,
        origem: servico ? "servico" : "painel",
        ...resumo,
      },
    },
  });

  return NextResponse.json(resumo);
}
