import { Prisma } from "@prisma/client";
import type { FinanceScope } from "@/lib/finance-escopo";
import { serieDoFluxo } from "@/lib/fluxo-diario";
import { prisma } from "@/lib/prisma";

export type ReconciliationFilter =
  | "ALL"
  | "PENDING"
  | "REVIEW"
  | "MATCHED"
  | "IGNORED";

export type ScopeFilter = FinanceScope | "ALL";

const DEFAULT_ACCOUNT_ID = "efi-production";

/**
 * Painel financeiro de uma conta.
 *
 * Duas regras seguram os números aqui:
 *
 * **Uma conta por vez.** `bank_accounts` tem moeda única, e o painel soma
 * valores — misturar a conta em EUR com a em BRL produziria um "total" que não
 * existe em lugar nenhum. Quem escolhe é o seletor de conta na tela.
 *
 * **`INTERNO` nunca entra em entradas e saídas.** Dinheiro que sai do Éfi e
 * chega na Wise aparece nos dois extratos; contá-lo dobraria receita e despesa
 * ao mesmo tempo. Ele continua visível na tabela — só não conta como
 * resultado.
 */
export async function getFinanceDashboard(
  rangeDays: number,
  filter: ReconciliationFilter,
  options?: { accountId?: string | null; scope?: ScopeFilter },
) {
  const days = [7, 30, 90, 365].includes(rangeDays) ? rangeDays : 30;
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = options?.scope ?? "ALL";

  const accounts = await prisma.bankAccount.findMany({
    where: { active: true },
    orderBy: [{ provider: "asc" }, { currency: "asc" }],
  });

  const requested = options?.accountId?.trim();
  const account =
    accounts.find((item) => item.id === requested) ??
    accounts.find((item) => item.id === DEFAULT_ACCOUNT_ID) ??
    accounts[0] ??
    null;
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;

  const scopeWhere: Prisma.BankTransactionWhereInput =
    scope === "ALL" ? {} : { scope };

  const baseWhere: Prisma.BankTransactionWhereInput = {
    accountId,
    occurredAt: { gte: periodStart },
    ...scopeWhere,
  };
  const tableWhere: Prisma.BankTransactionWhereInput = {
    ...baseWhere,
    ...(filter === "ALL" ? {} : { reconciliation: { is: { status: filter } } }),
  };

  const [
    latestBalance,
    latestSync,
    transactions,
    tableTransactions,
    reconciliationGroups,
    scopeGroups,
  ] = await Promise.all([
    prisma.balanceSnapshot.findFirst({
      where: { accountId },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.bankSyncRun.findFirst({
      where: { accountId },
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
          accountId,
          occurredAt: { gte: periodStart },
          ...scopeWhere,
        },
      },
      _count: { _all: true },
    }),
    prisma.bankTransaction.groupBy({
      by: ["scope"],
      where: { accountId, occurredAt: { gte: periodStart } },
      _count: { _all: true },
    }),
  ]);

  const resultTransactions = transactions.filter(
    (item) => item.scope !== "INTERNO",
  );
  const credits = resultTransactions
    .filter((item) => item.direction === "CREDIT")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const debits = resultTransactions
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

  const scopeCounts = Object.fromEntries(
    scopeGroups.map((group) => [group.scope, group._count._all]),
  ) as Record<string, number>;

  // Até 90 dias, uma barra por dia; no ano, uma por semana (ver serieDoFluxo).
  const chart = serieDoFluxo(resultTransactions, periodStart, days, days > 90 ? 7 : 1);

  return {
    days,
    filter,
    scope,
    periodStart,
    accounts,
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
      /** Quantas linhas ficaram de fora do resultado por serem entre contas. */
      internalCount: transactions.length - resultTransactions.length,
      counts,
      scopeCounts,
    },
    chart,
    /** Tamanho do balde do gráfico, em dias: 1 (diário) ou 7 (semanal). */
    chartStep: days > 90 ? 7 : 1,
    transactions: tableTransactions,
  };
}
