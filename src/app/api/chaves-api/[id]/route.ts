import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { origemEstrita } from "@/lib/http";
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
  if (!origemEstrita(request)) {
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

  const revogada = await prisma.$transaction(async (transacao) => {
    // Só quem muda a linha ativa registra a revogação, inclusive em retries.
    const resultado = await transacao.chaveDeApi.updateMany({
      where: { id, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
    if (resultado.count === 0) return false;

    await transacao.operationsAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "API_KEY_REVOKED",
        entityType: "ChaveDeApi",
        entityId: id,
        metadata: { prefixo: chave.prefixo },
      },
    });
    return true;
  });

  if (!revogada) {
    return NextResponse.json({ ok: true, jaRevogada: true });
  }

  return NextResponse.json({ ok: true });
}
