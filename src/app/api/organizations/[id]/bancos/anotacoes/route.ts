import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { limparAnotacao } from "@/lib/banco-cliente";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Anotação de tabela ou coluna: o que a equipe descobriu sobre o significado
 * do dado. É o único conteúdo do catálogo que a sincronização não reescreve.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tipo = body?.tipo;
  const alvoId = typeof body?.alvoId === "string" ? body.alvoId : "";
  const description = limparAnotacao(body?.description);
  if ((tipo !== "tabela" && tipo !== "coluna") || !alvoId) {
    return NextResponse.json({ error: "Informe o que está sendo anotado." }, { status: 400 });
  }

  // O alvo precisa ser deste cliente: o id vem do navegador.
  const gravado =
    tipo === "tabela"
      ? await prisma.clientDatabaseTable.updateMany({
          where: { id: alvoId, database: { organizationId: id } },
          data: { description },
        })
      : await prisma.clientDatabaseColumn.updateMany({
          where: { id: alvoId, table: { database: { organizationId: id } } },
          data: { description },
        });
  if (!gravado.count) return NextResponse.json({ error: "Item não encontrado neste cliente." }, { status: 404 });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      organizationId: id,
      action: "CLIENT_DATABASE_ANNOTATED",
      entityType: tipo === "tabela" ? "ClientDatabaseTable" : "ClientDatabaseColumn",
      entityId: alvoId,
      metadata: { description },
    },
  });

  return NextResponse.json({ description });
}
