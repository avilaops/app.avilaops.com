import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/** Remove a credencial do cofre. Não há "revelar": segredo apagado é segredo perdido. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; provider: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });

  const { id, provider } = await params;
  const existente = await prisma.organizationIntegrationConnection.findUnique({
    where: { organizationId_provider: { organizationId: id, provider } },
    select: { id: true },
  });
  if (!existente) return NextResponse.json({ error: "Credencial não encontrada." }, { status: 404 });

  await prisma.organizationIntegrationConnection.delete({ where: { id: existente.id } });
  await prisma.operationsAuditEvent.create({
    data: {
      action: "CREDENTIAL_DELETED",
      entityType: "OrganizationIntegrationConnection",
      entityId: existente.id,
      organizationId: id,
      actorId: admin.id,
      metadata: { provider },
    },
  });

  return NextResponse.json({ ok: true });
}
