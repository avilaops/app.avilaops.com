import { Prisma } from "@prisma/client";
import { fetchEfiFinancialSnapshot } from "@/lib/efi";
import { prisma } from "@/lib/prisma";

const EFI_ACCOUNT_ID = "efi-production";

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha desconhecida";
  return message.replace(/\s+/g, " ").slice(0, 240);
}

export async function runEfiSync(options?: {
  actorId?: string | null;
  days?: number;
}) {
  const days = Math.max(
    1,
    Math.min(
      365,
      options?.days ??
        Number.parseInt(process.env.EFI_SYNC_DAYS ?? "90", 10) ??
        90,
    ),
  );

  await prisma.bankAccount.upsert({
    where: { id: EFI_ACCOUNT_ID },
    update: { active: true, displayName: "Conta Efí Produção" },
    create: {
      id: EFI_ACCOUNT_ID,
      provider: "efi",
      externalId: "primary",
      displayName: "Conta Efí Produção",
      environment: "production",
      currency: "BRL",
    },
  });

  const run = await prisma.bankSyncRun.create({
    data: {
      accountId: EFI_ACCOUNT_ID,
      status: "RUNNING",
      scopeDays: days,
    },
  });

  try {
    const snapshot = await fetchEfiFinancialSnapshot(days);
    let receivedCount = 0;
    let sentCount = 0;

    await prisma.$transaction(async (transaction) => {
      await transaction.balanceSnapshot.create({
        data: {
          accountId: EFI_ACCOUNT_ID,
          availableBalance: new Prisma.Decimal(snapshot.balance.available),
          blockedTotal:
            snapshot.balance.blockedTotal === null
              ? null
              : new Prisma.Decimal(snapshot.balance.blockedTotal),
          blockedJudicial:
            snapshot.balance.blockedJudicial === null
              ? null
              : new Prisma.Decimal(snapshot.balance.blockedJudicial),
          blockedMed:
            snapshot.balance.blockedMed === null
              ? null
              : new Prisma.Decimal(snapshot.balance.blockedMed),
          capturedAt: snapshot.capturedAt,
        },
      });

      for (const item of snapshot.transactions) {
        if (item.direction === "CREDIT") receivedCount += 1;
        if (item.direction === "DEBIT") sentCount += 1;

        const bankTransaction = await transaction.bankTransaction.upsert({
          where: {
            accountId_externalId: {
              accountId: EFI_ACCOUNT_ID,
              externalId: item.externalId,
            },
          },
          update: {
            endToEndId: item.endToEndId,
            txid: item.txid,
            amount: new Prisma.Decimal(item.amount),
            description: item.description,
            occurredAt: item.occurredAt,
            rawHash: item.rawHash,
          },
          create: {
            accountId: EFI_ACCOUNT_ID,
            externalId: item.externalId,
            endToEndId: item.endToEndId,
            txid: item.txid,
            direction: item.direction,
            transactionType: item.transactionType,
            amount: new Prisma.Decimal(item.amount),
            description: item.description,
            counterpartyName: item.counterpartyName,
            occurredAt: item.occurredAt,
            rawHash: item.rawHash,
          },
        });

        // O nome do extrato entra numa passada à parte porque não pode
        // apagar identificação feita por comprovante: em Pix recebido o Éfi
        // devolve contraparte nula, e reescrever sem olhar devolveria a linha
        // identificada à mão para "Não informado" a cada sincronização.
        await transaction.bankTransaction.updateMany({
          where: {
            id: bankTransaction.id,
            OR: [
              { counterpartySource: null },
              { counterpartySource: { not: "COMPROVANTE" } },
            ],
          },
          data: { counterpartyName: item.counterpartyName },
        });

        await transaction.reconciliation.upsert({
          where: { transactionId: bankTransaction.id },
          update: {},
          create: {
            transactionId: bankTransaction.id,
            status: "PENDING",
            matchSource: "EFI_IMPORT",
          },
        });
      }

      await transaction.bankAccount.update({
        where: { id: EFI_ACCOUNT_ID },
        data: { lastSyncAt: snapshot.capturedAt },
      });

      await transaction.bankSyncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          receivedCount,
          sentCount,
          balanceCaptured: true,
          finishedAt: new Date(),
        },
      });

      await transaction.financeAuditEvent.create({
        data: {
          actorId: options?.actorId ?? null,
          action: "EFI_SYNC_COMPLETED",
          entityType: "BankSyncRun",
          entityId: run.id.toString(),
          metadata: {
            scopeDays: days,
            receivedCount,
            sentCount,
            periodStart: snapshot.periodStart.toISOString(),
            periodEnd: snapshot.periodEnd.toISOString(),
          },
        },
      });
    });

    return {
      runId: run.id.toString(),
      status: "SUCCESS" as const,
      receivedCount,
      sentCount,
    };
  } catch (error) {
    const errorMessage = safeErrorMessage(error);

    await prisma.$transaction([
      prisma.bankSyncRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorCode: "EFI_SYNC_FAILED",
          errorMessage,
          finishedAt: new Date(),
        },
      }),
      prisma.financeAuditEvent.create({
        data: {
          actorId: options?.actorId ?? null,
          action: "EFI_SYNC_FAILED",
          entityType: "BankSyncRun",
          entityId: run.id.toString(),
          metadata: { scopeDays: days, error: errorMessage },
        },
      }),
    ]);

    throw new Error(errorMessage);
  }
}
