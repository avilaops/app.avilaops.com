import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const allowedDirections = new Set(["PAYABLE", "RECEIVABLE"]);

function requiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    direction?: unknown;
    description?: unknown;
    counterparty?: unknown;
    amount?: unknown;
    dueDate?: unknown;
    category?: unknown;
    note?: unknown;
  };

  const direction = typeof body.direction === "string" ? body.direction : "";
  const description = requiredText(body.description, 200);
  const counterparty = optionalText(body.counterparty, 160);
  const category = optionalText(body.category, 60);
  const note = optionalText(body.note, 300);
  const amount =
    typeof body.amount === "number"
      ? body.amount
      : Number.parseFloat(String(body.amount ?? ""));
  const dueDate =
    typeof body.dueDate === "string" ? new Date(body.dueDate) : null;

  if (!allowedDirections.has(direction)) {
    return NextResponse.json(
      { error: "Informe se é uma conta a pagar ou a receber." },
      { status: 400 },
    );
  }
  if (!description) {
    return NextResponse.json(
      { error: "Informe uma descrição para o lançamento." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Informe um valor válido, maior que zero." },
      { status: 400 },
    );
  }
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return NextResponse.json(
      { error: "Informe uma data de vencimento válida." },
      { status: 400 },
    );
  }

  const entry = await prisma.$transaction(async (transaction) => {
    const created = await transaction.ledgerEntry.create({
      data: {
        direction,
        status: "OPEN",
        description,
        counterparty,
        amount: new Prisma.Decimal(amount),
        dueDate,
        category,
        note,
        createdBy: admin.id,
      },
    });

    await transaction.financeAuditEvent.create({
      data: {
        actorId: admin.id,
        action: "LEDGER_ENTRY_CREATED",
        entityType: "LedgerEntry",
        entityId: created.id.toString(),
        metadata: {
          direction,
          amount,
          dueDate: dueDate.toISOString(),
        },
      },
    });

    return created;
  });

  return NextResponse.json({
    ok: true,
    id: entry.id.toString(),
  });
}
