import { Prisma } from "@prisma/client";
import { isFinanceScope, suggestScope } from "@/lib/finance-escopo";
import { prisma } from "@/lib/prisma";
import { parseWiseCsv, type WiseMovement } from "@/lib/wise-csv";

/**
 * Importa o extrato da Wise para dentro do mesmo modelo que o Éfi já usa.
 *
 * Duas decisões seguram esse importador de pé:
 *
 * **Uma conta por moeda.** `bank_accounts` tem uma moeda só, e somar BRL com
 * EUR na mesma conta produz um saldo que não existe. O arquivo vira
 * `wise-brl`, `wise-eur`, `wise-usd` — quantas moedas o extrato tiver.
 *
 * **Reimportar não apaga decisão humana.** O extrato é exportado à mão e vai
 * ser reimportado com sobreposição de período. Linha já existente é
 * atualizada, mas escopo marcado na tela (`scope_source = "MANUAL"`) e
 * conciliação já resolvida ficam como estão — senão cada importação zeraria o
 * trabalho de triagem da vez anterior.
 */

const PROVIDER = "wise";
const ENVIRONMENT = "production";

/** Lote pequeno: 855 upserts numa transação só estoura o tempo limite. */
const CHUNK = 40;

export type WiseImportResult = {
  runIds: string[];
  accounts: Array<{
    id: string;
    currency: string;
    created: number;
    updated: number;
  }>;
  credits: number;
  debits: number;
  ignored: number;
  skipped: Array<{ line: number; reason: string }>;
  periodStart: Date | null;
  periodEnd: Date | null;
  scopeCounts: Record<string, number>;
};

export function accountIdForCurrency(currency: string): string {
  return `${PROVIDER}-${currency.toLowerCase()}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function ensureAccount(currency: string) {
  const id = accountIdForCurrency(currency);
  const displayName = `Wise · ${currency}`;

  await prisma.bankAccount.upsert({
    where: { id },
    update: { active: true, displayName },
    create: {
      id,
      provider: PROVIDER,
      externalId: currency.toLowerCase(),
      displayName,
      environment: ENVIRONMENT,
      currency,
    },
  });

  return id;
}

/**
 * Estado inicial da conciliação de uma linha importada.
 *
 * Conversão de saldo e compra estornada não são decisão de ninguém: o dinheiro
 * girou dentro da própria conta ou voltou. Entram como `IGNORED` com o motivo
 * escrito, para aparecerem no extrato sem poluir a fila de conciliação.
 */
function initialReconciliation(movement: WiseMovement) {
  if (movement.status === "REFUNDED") {
    return { status: "IGNORED", note: "Compra estornada pela Wise." };
  }
  if (movement.isInternalTransfer) {
    return {
      status: "IGNORED",
      note: "Dinheiro entre contas próprias — não é receita nem despesa.",
    };
  }
  return { status: "PENDING", note: null as string | null };
}

export async function importWiseStatement(
  content: string,
  options?: { actorId?: string | null },
): Promise<WiseImportResult> {
  const parsed = parseWiseCsv(content);
  if (parsed.movements.length === 0) {
    throw new Error("Nenhuma movimentação utilizável foi encontrada no arquivo.");
  }

  const byCurrency = new Map<string, WiseMovement[]>();
  for (const movement of parsed.movements) {
    const list = byCurrency.get(movement.currency) ?? [];
    list.push(movement);
    byCurrency.set(movement.currency, list);
  }

  const dates = parsed.movements.map((item) => item.occurredAt.getTime());
  const periodStart = new Date(Math.min(...dates));
  const periodEnd = new Date(Math.max(...dates));
  const scopeCounts: Record<string, number> = {};

  const accounts: WiseImportResult["accounts"] = [];
  const runIds: string[] = [];
  let credits = 0;
  let debits = 0;
  let ignored = 0;

  for (const [currency, movements] of byCurrency) {
    const accountId = await ensureAccount(currency);
    const scopeDays = Math.max(
      1,
      Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000),
    );
    const run = await prisma.bankSyncRun.create({
      data: { accountId, status: "RUNNING", scopeDays },
    });
    runIds.push(run.id.toString());

    let created = 0;
    let updated = 0;

    try {
      for (const batch of chunk(movements, CHUNK)) {
        await prisma.$transaction(async (transaction) => {
          for (const movement of batch) {
            const existing = await transaction.bankTransaction.findUnique({
              where: {
                accountId_externalId: {
                  accountId,
                  externalId: movement.externalId,
                },
              },
              select: { id: true, scope: true, scopeSource: true },
            });

            const suggestion = suggestScope({
              counterpartyName: movement.counterpartyName,
              description: movement.description,
              category: movement.category,
              reference: movement.reference,
              isInternalTransfer: movement.isInternalTransfer,
            });

            // Etiqueta posta à mão vence a regra, sempre.
            const keepManualScope =
              existing?.scopeSource === "MANUAL" && isFinanceScope(existing.scope);
            const scope = keepManualScope ? existing.scope : suggestion.scope;
            const scopeSource = keepManualScope ? "MANUAL" : "REGRA";

            scopeCounts[scope] = (scopeCounts[scope] ?? 0) + 1;
            if (movement.direction === "CREDIT") credits += 1;
            else debits += 1;

            const data = {
              endToEndId: null,
              txid: null,
              amount: new Prisma.Decimal(movement.amount),
              currency: movement.currency,
              description: movement.description,
              counterpartyName: movement.counterpartyName,
              occurredAt: movement.occurredAt,
              rawHash: movement.rawHash,
              scope,
              scopeSource,
              category: suggestion.category ?? movement.category,
            };

            const saved = existing
              ? await transaction.bankTransaction.update({
                  where: { id: existing.id },
                  data,
                })
              : await transaction.bankTransaction.create({
                  data: {
                    ...data,
                    accountId,
                    externalId: movement.externalId,
                    direction: movement.direction,
                    transactionType: movement.transactionType,
                  },
                });

            if (existing) updated += 1;
            else created += 1;

            const initial = initialReconciliation(movement);
            if (initial.status === "IGNORED") ignored += 1;

            await transaction.reconciliation.upsert({
              where: { transactionId: saved.id },
              // Conciliação já decidida não é revista por reimportação.
              update: {},
              create: {
                transactionId: saved.id,
                status: initial.status,
                note: initial.note,
                matchSource: "WISE_IMPORT",
                matchedAt: initial.status === "IGNORED" ? new Date() : null,
              },
            });
          }
        });
      }

      await prisma.bankAccount.update({
        where: { id: accountId },
        data: { lastSyncAt: new Date() },
      });
      await prisma.bankSyncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          receivedCount: movements.filter((item) => item.direction === "CREDIT")
            .length,
          sentCount: movements.filter((item) => item.direction === "DEBIT")
            .length,
          balanceCaptured: false,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : "Falha desconhecida"
      )
        .replace(/\s+/g, " ")
        .slice(0, 240);

      await prisma.bankSyncRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorCode: "WISE_IMPORT_FAILED",
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw new Error(message);
    }

    accounts.push({ id: accountId, currency, created, updated });
  }

  await prisma.financeAuditEvent.create({
    data: {
      actorId: options?.actorId ?? null,
      action: "WISE_IMPORT_COMPLETED",
      entityType: "BankSyncRun",
      entityId: runIds[0] ?? null,
      metadata: {
        runIds,
        accounts: accounts.map((item) => ({
          id: item.id,
          created: item.created,
          updated: item.updated,
        })),
        credits,
        debits,
        ignored,
        skipped: parsed.skipped.length,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        scopeCounts,
      },
    },
  });

  return {
    runIds,
    accounts,
    credits,
    debits,
    ignored,
    skipped: parsed.skipped,
    periodStart,
    periodEnd,
    scopeCounts,
  };
}
