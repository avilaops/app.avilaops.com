import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const allowedStatuses = new Set(["PENDING", "REVIEW", "MATCHED", "IGNORED"]);
const allowedReferenceTypes = new Set([
  "ORDER",
  "INVOICE",
  "EXPENSE",
  "MANUAL",
]);

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Movimentação inválida." }, { status: 400 });
  }

  const body = (await request.json()) as {
    status?: unknown;
    referenceType?: unknown;
    referenceId?: unknown;
    note?: unknown;
  };
  const status = typeof body.status === "string" ? body.status : "";
  const referenceType = optionalText(body.referenceType, 30);
  const referenceId = optionalText(body.referenceId, 120);
  const note = optionalText(body.note, 300);

  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }
  if (referenceType && !allowedReferenceTypes.has(referenceType)) {
    return NextResponse.json(
      { error: "Tipo de referência inválido." },
      { status: 400 },
    );
  }
  if (status === "MATCHED" && !referenceId) {
    return NextResponse.json(
      { error: "Informe a referência usada na conciliação." },
      { status: 400 },
    );
  }

  try {
    const transactionId = BigInt(id);
    const result = await prisma.$transaction(async (transaction) => {
      const reconciliation = await transaction.reconciliation.update({
        where: { transactionId },
        data: {
          status,
          referenceType: referenceId ? referenceType ?? "MANUAL" : null,
          referenceId,
          note,
          reviewedBy: admin.id,
          matchedAt: status === "MATCHED" ? new Date() : null,
          matchSource: "MANUAL_REVIEW",
        },
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "RECONCILIATION_UPDATED",
          entityType: "BankTransaction",
          entityId: id,
          metadata: {
            status,
            referenceType: reconciliation.referenceType,
            referenceId: reconciliation.referenceId,
          },
        },
      });

      return reconciliation;
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      { error: "Movimentação não encontrada." },
      { status: 404 },
    );
  }
}
