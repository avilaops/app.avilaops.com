import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { PrismaApprovalStore } from "@/lib/ai-core/approval-store";
import { prisma } from "@/lib/prisma";

const allowedDecisions = new Set(["APPROVED", "REJECTED"]);

/**
 * Decide (aprovar/rejeitar) um pedido de aprovação humana pendente.
 * Rejeição sem justificativa é recusada aqui, antes mesmo de chegar ao
 * PrismaApprovalStore (que também valida, em defesa dupla). A proteção
 * contra decisão duplicada vem do próprio store — decide() só afeta o
 * registro se ele ainda estiver PENDING; retornamos 409 quando não aplicou.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    decision?: unknown;
    rejectionReason?: unknown;
  };

  const decision = typeof body.decision === "string" ? body.decision : "";
  if (!allowedDecisions.has(decision)) {
    return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
  }

  const rejectionReason =
    typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
  if (decision === "REJECTED" && !rejectionReason) {
    return NextResponse.json(
      { error: "Informe a justificativa para rejeitar." },
      { status: 400 },
    );
  }

  const approval = await prisma.aiCoreApproval.findUnique({ where: { id } });
  if (!approval) {
    return NextResponse.json({ error: "Aprovação não encontrada." }, { status: 404 });
  }
  if (approval.status === "PENDING" && approval.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este pedido de aprovação expirou." }, { status: 409 });
  }

  const store = new PrismaApprovalStore();
  const result = await store.decide(
    id,
    decision as "APPROVED" | "REJECTED",
    admin.id,
    decision === "REJECTED" ? rejectionReason : undefined,
  );

  if (!result.applied) {
    return NextResponse.json(
      { error: "Este pedido já foi decidido por outra pessoa." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, status: decision });
}
