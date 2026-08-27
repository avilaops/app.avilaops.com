import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import {
  LEDGER_DIRECTIONS,
  LEDGER_STATUSES,
  listLedgerEntries,
  type LedgerDirection,
  type LedgerFilter,
  type LedgerStatus,
} from "@/lib/contas";
import { isFinanceScope } from "@/lib/finance-escopo";
import { prisma } from "@/lib/prisma";

const allowedDirections = new Set<string>(LEDGER_DIRECTIONS);
const allowedCurrencies = new Set(["BRL", "EUR", "USD"]);

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

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const direction = url.searchParams.get("direction") ?? "ALL";
  const status = url.searchParams.get("status") ?? "ALL";
  const scope = url.searchParams.get("scope") ?? "ALL";
  const currency = url.searchParams.get("currency") ?? "";
  const search = url.searchParams.get("q") ?? "";

  const filter: LedgerFilter = {
    direction: allowedDirections.has(direction)
      ? (direction as LedgerDirection)
      : "ALL",
    status:
      status === "OVERDUE" || (LEDGER_STATUSES as readonly string[]).includes(status)
        ? (status as LedgerStatus | "OVERDUE")
        : "ALL",
    scope: isFinanceScope(scope) ? scope : "ALL",
    currency: allowedCurrencies.has(currency) ? currency : undefined,
    search: search.trim() || undefined,
  };

  const { rows, totals } = await listLedgerEntries(filter);

  return NextResponse.json({
    entries: rows.map((row) => ({
      ...row,
      dueDate: row.dueDate.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
    })),
    totals,
  });
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
    currency?: unknown;
    scope?: unknown;
    dueDate?: unknown;
    category?: unknown;
    note?: unknown;
  };

  const direction = typeof body.direction === "string" ? body.direction : "";
  const description = requiredText(body.description, 200);
  const counterparty = optionalText(body.counterparty, 160);
  const category = optionalText(body.category, 60);
  const note = optionalText(body.note, 300);
  const currency =
    typeof body.currency === "string" && allowedCurrencies.has(body.currency)
      ? body.currency
      : "BRL";
  // Só faz sentido lançar conta como empresa ou pessoal: "entre contas" é
  // classificação de extrato, não de compromisso a vencer.
  const scope =
    body.scope === "PESSOAL" ? "PESSOAL" : ("EMPRESA" as "EMPRESA" | "PESSOAL");
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
        currency,
        scope,
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
          currency,
          scope,
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
