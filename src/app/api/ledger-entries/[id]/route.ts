import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Edição e baixa de uma conta a pagar/receber.
 *
 * Cancelar não apaga: `DELETE` marca `CANCELLED`. Um lançamento que já foi
 * conciliado com uma movimentação bancária é evidência, e sumir com a linha
 * deixaria a movimentação apontando para um id que não existe mais.
 */

const allowedStatuses = new Set(["OPEN", "PAID", "CANCELLED"]);
const allowedCurrencies = new Set(["BRL", "EUR", "USD"]);

function optionalText(value: unknown, maxLength: number): string | null {
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
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Lançamento inválido." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
    description?: unknown;
    counterparty?: unknown;
    amount?: unknown;
    currency?: unknown;
    scope?: unknown;
    dueDate?: unknown;
    paidAt?: unknown;
    category?: unknown;
    note?: unknown;
  };

  const data: Prisma.LedgerEntryUpdateInput = {};

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    }
    data.status = status;
    if (status === "PAID") {
      const paidAt =
        typeof body.paidAt === "string" ? new Date(body.paidAt) : new Date();
      data.paidAt = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt;
    } else {
      // Reabrir ou cancelar tira a data de pagamento: ela viraria mentira.
      data.paidAt = null;
    }
  }

  if (body.description !== undefined) {
    const description = optionalText(body.description, 200);
    if (!description) {
      return NextResponse.json(
        { error: "A descrição não pode ficar vazia." },
        { status: 400 },
      );
    }
    data.description = description;
  }

  if (body.counterparty !== undefined) {
    data.counterparty = optionalText(body.counterparty, 160);
  }
  if (body.category !== undefined) {
    data.category = optionalText(body.category, 60);
  }
  if (body.note !== undefined) {
    data.note = optionalText(body.note, 300);
  }
  if (body.scope !== undefined) {
    const scope = String(body.scope);
    if (scope !== "EMPRESA" && scope !== "PESSOAL") {
      return NextResponse.json({ error: "Escopo inválido." }, { status: 400 });
    }
    data.scope = scope;
  }
  if (body.currency !== undefined) {
    const currency = String(body.currency);
    if (!allowedCurrencies.has(currency)) {
      return NextResponse.json({ error: "Moeda inválida." }, { status: 400 });
    }
    data.currency = currency;
  }
  if (body.amount !== undefined) {
    const amount =
      typeof body.amount === "number"
        ? body.amount
        : Number.parseFloat(String(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Informe um valor válido, maior que zero." },
        { status: 400 },
      );
    }
    data.amount = new Prisma.Decimal(amount);
  }
  if (body.dueDate !== undefined) {
    const dueDate = new Date(String(body.dueDate));
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json(
        { error: "Informe uma data de vencimento válida." },
        { status: 400 },
      );
    }
    data.dueDate = dueDate;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  try {
    const entryId = BigInt(id);
    const updated = await prisma.$transaction(async (transaction) => {
      const entry = await transaction.ledgerEntry.update({
        where: { id: entryId },
        data,
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "LEDGER_ENTRY_UPDATED",
          entityType: "LedgerEntry",
          entityId: id,
          metadata: { changes: Object.keys(data), status: entry.status },
        },
      });

      return entry;
    });

    return NextResponse.json({
      ok: true,
      id: updated.id.toString(),
      status: updated.status,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Lançamento não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível atualizar o lançamento." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
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
    return NextResponse.json({ error: "Lançamento inválido." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.ledgerEntry.update({
        where: { id: BigInt(id) },
        data: { status: "CANCELLED", paidAt: null },
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: admin.id,
          action: "LEDGER_ENTRY_CANCELLED",
          entityType: "LedgerEntry",
          entityId: id,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Lançamento não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível cancelar o lançamento." },
      { status: 500 },
    );
  }
}
