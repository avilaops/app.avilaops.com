import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Revogar chave. Marca `revogada_em` e mantém a linha: a auditoria das ações
 * feitas com a chave aponta para ela.
 */
export async function DELETE(request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin || !ehDono(admin.role)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await contexto.params;
  const chave = await prisma.chaveDeApi.findUnique({
    where: { id },
    select: { id: true, prefixo: true, revogadaEm: true },
  });
  if (!chave) {
    return NextResponse.json({ error: "Chave não encontrada." }, { status: 404 });
  }
  if (chave.revogadaEm) {
    return NextResponse.json({ ok: true, jaRevogada: true });
  }

  await prisma.$transaction([
    prisma.chaveDeApi.update({ where: { id }, data: { revogadaEm: new Date() } }),
    prisma.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "API_KEY_REVOKED",
        entityType: "ChaveDeApi",
        entityId: id,
        metadata: { prefixo: chave.prefixo },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
