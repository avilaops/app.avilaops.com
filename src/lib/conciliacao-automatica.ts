import { prisma } from "@/lib/prisma";

/**
 * Conciliação automática: casa movimentação do banco com conta a pagar/receber.
 *
 * O que sustenta a decisão é a combinação de três sinais fracos — valor, data e
 * nome — e não um só. Valor sozinho casa o aluguel de agosto com o de julho;
 * data sozinha casa tudo que aconteceu no mesmo dia. Por isso aqui há
 * **pontuação**, e não regra binária: acima de `AUTO_MATCH` o vínculo é escrito
 * e a conta é baixada; entre `SUGESTAO` e `AUTO_MATCH` a linha vai para
 * revisão com o palpite anotado, para uma pessoa confirmar; abaixo disso,
 * ninguém toca.
 *
 * O casamento é guloso e um-para-um: uma conta a receber não pode ser baixada
 * por dois Pix diferentes, nem o mesmo Pix baixar duas contas.
 */

/** A partir daqui o vínculo é escrito sozinho e a conta é dada como paga. */
const AUTO_MATCH = 0.85;
/** A partir daqui vira sugestão em revisão, nunca baixa automática. */
const SUGESTAO = 0.6;

const DIRECTION_TO_LEDGER = {
  CREDIT: "RECEIVABLE",
  DEBIT: "PAYABLE",
} as const;

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Semelhança entre contrapartes por palavras em comum.
 *
 * Comparação exata não serve: o banco escreve "JLA IMPORTADORA DE VEDACOES E
 * ROLAMENTOS LTDA" e o lançamento diz "JLA". Palavras de uma ou duas letras e
 * sufixos de razão social são ruído puro e ficam de fora da conta.
 */
const RUIDO = new Set([
  "ltda",
  "me",
  "eireli",
  "sa",
  "s a",
  "cia",
  "do",
  "da",
  "de",
  "dos",
  "das",
  "e",
]);

function similarity(left: string | null, right: string | null): number {
  const a = normalize(left)
    .split(" ")
    .filter((word) => word.length > 2 && !RUIDO.has(word));
  const b = normalize(right)
    .split(" ")
    .filter((word) => word.length > 2 && !RUIDO.has(word));
  if (a.length === 0 || b.length === 0) return 0;

  const setB = new Set(b);
  const common = a.filter((word) => setB.has(word)).length;
  return common / Math.min(a.length, b.length);
}

function daysBetween(left: Date, right: Date): number {
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

export type MatchCandidate = {
  transactionId: bigint;
  entryId: bigint;
  confidence: number;
  reasons: string[];
};

type TransactionLike = {
  id: bigint;
  direction: string;
  amount: unknown;
  currency: string;
  counterpartyName: string | null;
  description: string;
  occurredAt: Date;
};

type EntryLike = {
  id: bigint;
  direction: string;
  amount: unknown;
  currency: string;
  counterparty: string | null;
  description: string;
  dueDate: Date;
};

/** Pontua um par. Devolve `null` quando nem faz sentido comparar. */
export function scoreMatch(
  transaction: TransactionLike,
  entry: EntryLike,
): MatchCandidate | null {
  if (DIRECTION_TO_LEDGER[transaction.direction as "CREDIT" | "DEBIT"] !== entry.direction) {
    return null;
  }
  if (transaction.currency !== entry.currency) return null;

  const bankAmount = Number(transaction.amount);
  const entryAmount = Number(entry.amount);
  if (!Number.isFinite(bankAmount) || !Number.isFinite(entryAmount)) return null;

  const reasons: string[] = [];
  const difference = Math.abs(bankAmount - entryAmount);
  const relative = entryAmount > 0 ? difference / entryAmount : 1;

  let confidence: number;
  if (difference <= 0.01) {
    confidence = 0.6;
    reasons.push("valor exato");
  } else if (relative <= 0.01) {
    confidence = 0.4;
    reasons.push("valor a menos de 1% de diferença");
  } else {
    // Diferença maior que 1% não é a mesma conta; é outra conta parecida.
    return null;
  }

  // Os pesos são calibrados para que valor + data **sozinhos** nunca cheguem a
  // `AUTO_MATCH`: valor redondo no dia do vencimento é exatamente o par que
  // casa a mensalidade de agosto com a de julho. Baixa automática exige que a
  // contraparte também confirme.
  const distance = daysBetween(transaction.occurredAt, entry.dueDate);
  if (distance <= 3) {
    confidence += 0.2;
    reasons.push("no vencimento");
  } else if (distance <= 10) {
    confidence += 0.12;
    reasons.push("até 10 dias do vencimento");
  } else if (distance <= 30) {
    confidence += 0.05;
    reasons.push("no mês do vencimento");
  } else {
    return null;
  }

  const nameScore = Math.max(
    similarity(transaction.counterpartyName, entry.counterparty),
    similarity(transaction.description, entry.counterparty),
  );
  if (nameScore >= 0.75) {
    confidence += 0.2;
    reasons.push("contraparte confere");
  } else if (nameScore >= 0.4) {
    confidence += 0.1;
    reasons.push("contraparte parecida");
  }

  return {
    transactionId: transaction.id,
    entryId: entry.id,
    confidence: Math.min(1, confidence),
    reasons,
  };
}

export type AutoReconcileResult = {
  analyzed: number;
  matched: number;
  suggested: number;
  candidates: Array<{
    transactionId: string;
    entryId: string;
    confidence: number;
    reasons: string[];
    applied: boolean;
  }>;
};

/**
 * Roda a conciliação sobre o que ainda está em aberto dos dois lados.
 *
 * `dryRun` existe porque a primeira execução sobre um histórico inteiro é
 * justamente a que ninguém quer aplicar às cegas.
 */
export async function runAutoReconciliation(options?: {
  actorId?: string | null;
  days?: number;
  dryRun?: boolean;
}): Promise<AutoReconcileResult> {
  const days = Math.max(1, Math.min(730, options?.days ?? 180));
  const since = new Date(Date.now() - days * 86_400_000);

  const [transactions, entries] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        occurredAt: { gte: since },
        // Só quem ainda espera decisão, e nunca dinheiro entre contas próprias.
        scope: { not: "INTERNO" },
        reconciliation: { is: { status: { in: ["PENDING", "REVIEW"] } } },
      },
      select: {
        id: true,
        direction: true,
        amount: true,
        currency: true,
        counterpartyName: true,
        description: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 2000,
    }),
    prisma.ledgerEntry.findMany({
      where: { status: "OPEN" },
      select: {
        id: true,
        direction: true,
        amount: true,
        currency: true,
        counterparty: true,
        description: true,
        dueDate: true,
      },
      take: 2000,
    }),
  ]);

  const candidates: MatchCandidate[] = [];
  for (const transaction of transactions) {
    for (const entry of entries) {
      const candidate = scoreMatch(transaction, entry);
      if (candidate && candidate.confidence >= SUGESTAO) candidates.push(candidate);
    }
  }

  // Guloso pelo melhor par: cada movimentação e cada conta usadas uma vez só.
  candidates.sort((left, right) => right.confidence - left.confidence);
  const usedTransactions = new Set<string>();
  const usedEntries = new Set<string>();
  const chosen: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const transactionKey = candidate.transactionId.toString();
    const entryKey = candidate.entryId.toString();
    if (usedTransactions.has(transactionKey) || usedEntries.has(entryKey)) continue;
    usedTransactions.add(transactionKey);
    usedEntries.add(entryKey);
    chosen.push(candidate);
  }

  const result: AutoReconcileResult = {
    analyzed: transactions.length,
    matched: 0,
    suggested: 0,
    candidates: [],
  };

  for (const candidate of chosen) {
    const auto = candidate.confidence >= AUTO_MATCH;
    const applied = auto && !options?.dryRun;
    if (auto) result.matched += 1;
    else result.suggested += 1;

    result.candidates.push({
      transactionId: candidate.transactionId.toString(),
      entryId: candidate.entryId.toString(),
      confidence: Number(candidate.confidence.toFixed(4)),
      reasons: candidate.reasons,
      applied,
    });

    if (options?.dryRun) continue;

    const note = `Conciliado automaticamente: ${candidate.reasons.join(", ")}.`;

    await prisma.$transaction(async (transaction) => {
      await transaction.reconciliation.update({
        where: { transactionId: candidate.transactionId },
        data: {
          status: auto ? "MATCHED" : "REVIEW",
          referenceType: "LEDGER",
          referenceId: candidate.entryId.toString(),
          confidence: candidate.confidence,
          matchSource: "AUTO_MATCH",
          matchedAt: auto ? new Date() : null,
          note: auto
            ? note
            : `Sugestão automática (${Math.round(candidate.confidence * 100)}%): ${candidate.reasons.join(", ")}.`,
        },
      });

      if (auto) {
        const bankTransaction = await transaction.bankTransaction.findUnique({
          where: { id: candidate.transactionId },
          select: { occurredAt: true },
        });

        await transaction.ledgerEntry.update({
          where: { id: candidate.entryId },
          data: {
            status: "PAID",
            paidAt: bankTransaction?.occurredAt ?? new Date(),
            referenceType: "BANK_TRANSACTION",
            referenceId: candidate.transactionId.toString(),
          },
        });
      }
    });
  }

  await prisma.financeAuditEvent.create({
    data: {
      actorId: options?.actorId ?? null,
      action: options?.dryRun
        ? "AUTO_RECONCILIATION_SIMULATED"
        : "AUTO_RECONCILIATION_RUN",
      entityType: "Reconciliation",
      metadata: {
        days,
        analyzed: result.analyzed,
        matched: result.matched,
        suggested: result.suggested,
      },
    },
  });

  return result;
}
