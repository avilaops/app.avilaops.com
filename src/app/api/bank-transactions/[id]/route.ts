import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { isFinanceScope } from "@/lib/finance-escopo";
import { prisma } from "@/lib/prisma";

/**
 * Marca uma movimentação como da empresa, pessoal ou entre contas.
 *
 * A marcação grava `scope_source = "MANUAL"`, e é isso que faz a reimportação
 * do extrato respeitar a decisão em vez de reescrevê-la com a regra.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Movimentação inválida." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { scope?: unknown };
  if (!isFinanceScope(body.scope)) {
    return NextResponse.json({ error: "Escopo inválido." }, { status: 400 });
  }
  const scope = body.scope;

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.bankTransaction.update({
        where: { id: BigInt(id) },
        data: { scope, scopeSource: "MANUAL" },
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "BANK_TRANSACTION_SCOPE_SET",
          entityType: "BankTransaction",
          entityId: id,
          metadata: { scope },
        },
      });

      return saved;
    });

    return NextResponse.json({ ok: true, scope: updated.scope });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível classificar a movimentação." },
      { status: 500 },
    );
  }
}
