import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Apaga uma leitura registrada errado. Só o dono, e fica na auditoria. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Leitura inválida." }, { status: 400 });

  const leitura = await prisma.creditScoreReading.findUnique({ where: { id: BigInt(id) } });
  if (!leitura) return NextResponse.json({ error: "Leitura não encontrada." }, { status: 404 });

  await prisma.$transaction([
    prisma.creditScoreReading.delete({ where: { id: leitura.id } }),
    prisma.financeAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "CREDIT_SCORE_DELETED",
        entityType: "CreditScoreReading",
        entityId: id,
        metadata: {
          subjectKind: leitura.subjectKind,
          bureau: leitura.bureau,
          score: leitura.score,
          readAt: leitura.readAt.toISOString(),
        },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
