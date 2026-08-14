import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReconciliationFilter =
  | "ALL"
  | "PENDING"
  | "REVIEW"
  | "MATCHED"
  | "IGNORED";

export async function getFinanceDashboard(
  rangeDays: number,
  filter: ReconciliationFilter,
) {
  const days = [7, 30, 90, 365].includes(rangeDays) ? rangeDays : 30;
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const baseWhere: Prisma.BankTransactionWhereInput = {
    accountId: "efi-production",
    occurredAt: { gte: periodStart },
  };
  const tableWhere: Prisma.BankTransactionWhereInput = {
    ...baseWhere,
    ...(filter === "ALL"
      ? {}
      : { reconciliation: { is: { status: filter } } }),
  };

  const [
    account,
    latestBalance,
    latestSync,
    transactions,
    tableTransactions,
    reconciliationGroups,
  ] = await Promise.all([
    prisma.bankAccount.findUnique({ where: { id: "efi-production" } }),
    prisma.balanceSnapshot.findFirst({
      where: { accountId: "efi-production" },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.bankSyncRun.findFirst({
      where: { accountId: "efi-production" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.bankTransaction.findMany({
      where: baseWhere,
      include: { reconciliation: true },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.bankTransaction.findMany({
      where: tableWhere,
      include: { reconciliation: true },
      orderBy: { occurredAt: "desc" },
      take: 80,
    }),
    prisma.reconciliation.groupBy({
      by: ["status"],
      where: {
        transaction: {
          accountId: "efi-production",
          occurredAt: { gte: periodStart },
        },
      },
      _count: { _all: true },
    }),
  ]);

  const credits = transactions
    .filter((item) => item.direction === "CREDIT")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const debits = transactions
    .filter((item) => item.direction === "DEBIT")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const counts = Object.fromEntries(
    reconciliationGroups.map((group) => [group.status, group._count._all]),
  ) as Record<string, number>;
  const total = transactions.length;
  const matched = counts.MATCHED ?? 0;
  const reconciliationRate = total > 0 ? (matched / total) * 100 : 0;
  const attentionCount = (counts.PENDING ?? 0) + (counts.REVIEW ?? 0);
  const attentionAmount = transactions
    .filter((item) =>
      ["PENDING", "REVIEW"].includes(item.reconciliation?.status ?? "PENDING"),
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const chartMap = new Map<
    string,
    { date: string; credits: number; debits: number }
  >();
  for (const transaction of transactions) {
    const key = transaction.occurredAt.toISOString().slice(0, 10);
    const point = chartMap.get(key) ?? { date: key, credits: 0, debits: 0 };
    if (transaction.direction === "CREDIT") {
      point.credits += Number(transaction.amount);
    } else {
      point.debits += Number(transaction.amount);
    }
    chartMap.set(key, point);
  }

  return {
    days,
    filter,
    periodStart,
    account,
    latestBalance,
    latestSync,
    metrics: {
      credits,
      debits,
      net: credits - debits,
      reconciliationRate,
      attentionCount,
      attentionAmount,
      transactionCount: total,
      counts,
    },
    chart: Array.from(chartMap.values()),
    transactions: tableTransactions,
  };
}
