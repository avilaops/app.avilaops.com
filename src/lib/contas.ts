import { Prisma } from "@prisma/client";
import type { FinanceScope } from "@/lib/finance-escopo";
import { prisma } from "@/lib/prisma";

/**
 * Contas a pagar e a receber.
 *
 * O modelo `LedgerEntry` já existia no banco, mas só tinha porta de entrada:
 * dava para criar lançamento e nunca mais vê-lo. Aqui está o que faltava para
 * ele virar contas a pagar de verdade — listar, somar, saber o que venceu e
 * dar baixa.
 *
 * "Vencido" não é um estado guardado no banco, é uma leitura da data: gravar
 * `OVERDUE` exigiria alguém rodando um job à meia-noite para envelhecer as
 * linhas, e o dia em que esse job falhasse a tela mentiria.
 */

export const LEDGER_STATUSES = ["OPEN", "PAID", "CANCELLED"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const LEDGER_DIRECTIONS = ["PAYABLE", "RECEIVABLE"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export type LedgerFilter = {
  direction?: LedgerDirection | "ALL";
  status?: LedgerStatus | "OVERDUE" | "ALL";
  scope?: FinanceScope | "ALL";
  currency?: string;
  search?: string;
};

export type LedgerRow = {
  id: string;
  direction: LedgerDirection;
  status: LedgerStatus;
  description: string;
  counterparty: string | null;
  amount: string;
  currency: string;
  scope: string;
  dueDate: Date;
  paidAt: Date | null;
  category: string | null;
  note: string | null;
  referenceType: string | null;
  referenceId: string | null;
  overdue: boolean;
  daysLate: number;
};

export type LedgerTotals = {
  openPayable: number;
  openReceivable: number;
  overduePayable: number;
  overdueReceivable: number;
  paidPayable: number;
  paidReceivable: number;
  /** A receber menos a pagar, só do que está em aberto. */
  projectedNet: number;
  overdueCount: number;
  dueNext7Days: number;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toRow(
  entry: {
    id: bigint;
    direction: string;
    status: string;
    description: string;
    counterparty: string | null;
    amount: Prisma.Decimal;
    currency: string;
    scope: string;
    dueDate: Date;
    paidAt: Date | null;
    category: string | null;
    note: string | null;
    referenceType: string | null;
    referenceId: string | null;
  },
  today: Date,
): LedgerRow {
  const overdue = entry.status === "OPEN" && entry.dueDate < today;
  return {
    id: entry.id.toString(),
    direction: entry.direction as LedgerDirection,
    status: entry.status as LedgerStatus,
    description: entry.description,
    counterparty: entry.counterparty,
    amount: entry.amount.toString(),
    currency: entry.currency,
    scope: entry.scope,
    dueDate: entry.dueDate,
    paidAt: entry.paidAt,
    category: entry.category,
    note: entry.note,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    overdue,
    daysLate: overdue
      ? Math.floor((today.getTime() - entry.dueDate.getTime()) / 86_400_000)
      : 0,
  };
}

function buildWhere(filter: LedgerFilter, today: Date): Prisma.LedgerEntryWhereInput {
  const where: Prisma.LedgerEntryWhereInput = {};

  if (filter.direction && filter.direction !== "ALL") {
    where.direction = filter.direction;
  }
  if (filter.scope && filter.scope !== "ALL") {
    where.scope = filter.scope;
  }
  if (filter.currency) {
    where.currency = filter.currency;
  }
  if (filter.status === "OVERDUE") {
    where.status = "OPEN";
    where.dueDate = { lt: today };
  } else if (filter.status && filter.status !== "ALL") {
    where.status = filter.status;
  }
  if (filter.search) {
    const search = filter.search.slice(0, 80);
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { counterparty: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function listLedgerEntries(
  filter: LedgerFilter,
  limit = 200,
): Promise<{ rows: LedgerRow[]; totals: LedgerTotals; today: Date }> {
  const today = startOfToday();
  const in7Days = new Date(today.getTime() + 7 * 86_400_000);

  const [entries, openEntries, paidGroups] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: buildWhere(filter, today),
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: Math.min(500, limit),
    }),
    // Os totais ignoram o filtro de tela de propósito: o cabeçalho responde
    // "quanto a Ávila deve e quanto tem a receber", não "quanto há na aba".
    prisma.ledgerEntry.findMany({
      where: {
        status: "OPEN",
        ...(filter.scope && filter.scope !== "ALL" ? { scope: filter.scope } : {}),
      },
      select: { direction: true, amount: true, dueDate: true },
    }),
    prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: {
        status: "PAID",
        ...(filter.scope && filter.scope !== "ALL" ? { scope: filter.scope } : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const totals: LedgerTotals = {
    openPayable: 0,
    openReceivable: 0,
    overduePayable: 0,
    overdueReceivable: 0,
    paidPayable: 0,
    paidReceivable: 0,
    projectedNet: 0,
    overdueCount: 0,
    dueNext7Days: 0,
  };

  for (const entry of openEntries) {
    const amount = Number(entry.amount);
    const late = entry.dueDate < today;
    if (entry.direction === "PAYABLE") {
      totals.openPayable += amount;
      if (late) totals.overduePayable += amount;
    } else {
      totals.openReceivable += amount;
      if (late) totals.overdueReceivable += amount;
    }
    if (late) totals.overdueCount += 1;
    if (!late && entry.dueDate <= in7Days) totals.dueNext7Days += 1;
  }

  for (const group of paidGroups) {
    const amount = Number(group._sum.amount ?? 0);
    if (group.direction === "PAYABLE") totals.paidPayable = amount;
    else totals.paidReceivable = amount;
  }

  totals.projectedNet = totals.openReceivable - totals.openPayable;

  return { rows: entries.map((entry) => toRow(entry, today)), totals, today };
}
