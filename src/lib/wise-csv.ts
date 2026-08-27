import { createHash } from "crypto";

/**
 * Leitor do extrato da Wise ("transaction-history.csv").
 *
 * A Wise não é um banco de uma moeda só: o mesmo arquivo traz o saldo em BRL,
 * em EUR e em USD, e uma linha só afeta um deles — menos quando é conversão,
 * que tira de um e põe no outro. Por isso a saída daqui não é "uma linha, uma
 * movimentação": conversão vira **duas** movimentações, uma em cada saldo, ou
 * o extrato nunca fecha com o saldo real.
 *
 * O arquivo também mistura três situações que não podem virar a mesma coisa:
 * `COMPLETED` é dinheiro que andou, `REFUNDED` é compra estornada (o valor
 * voltou, então não é despesa) e `CANCELLED` nunca saiu do lugar — essa é
 * simplesmente descartada.
 */

export type WiseMovement = {
  /** Moeda do saldo afetado — é ela que decide em qual conta a linha entra. */
  currency: string;
  externalId: string;
  direction: "CREDIT" | "DEBIT";
  transactionType: string;
  amount: number;
  description: string;
  counterpartyName: string | null;
  sourceName: string | null;
  occurredAt: Date;
  category: string | null;
  reference: string | null;
  /** COMPLETED ou REFUNDED. Estorno entra no extrato, mas não no resultado. */
  status: string;
  isInternalTransfer: boolean;
  rawHash: string;
};

export type WiseParseResult = {
  movements: WiseMovement[];
  /** Linhas descartadas, com o motivo, para o importador prestar contas. */
  skipped: Array<{ line: number; reason: string }>;
  currencies: string[];
};

/** Cabeçalhos em português e inglês: a Wise exporta no idioma da conta. */
const COLUMNS = {
  id: ["Número da transferência", "TransferWise ID", "ID"],
  status: ["Situação", "Status"],
  direction: ["Direção", "Direction"],
  createdAt: ["Criada em", "Created on"],
  finishedAt: ["Concluída em", "Finished on"],
  sourceName: ["Nome de origem", "Source name"],
  sourceAmount: [
    "Valor de origem (tarifas inclusas)",
    "Source amount (after fees)",
  ],
  sourceCurrency: ["Moeda de origem", "Source currency"],
  targetName: ["Nome do beneficiário", "Target name"],
  targetAmount: [
    "Valor de destino (tarifas inclusas)",
    "Target amount (after fees)",
  ],
  targetCurrency: ["Moeda de destino", "Target currency"],
  reference: ["Referência", "Reference"],
  category: ["Categoria", "Category"],
  message: ["Mensagem", "Message"],
} as const;

type ColumnKey = keyof typeof COLUMNS;

/** CSV da Wise é RFC 4180: vírgula dentro de campo só existe entre aspas. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // O Excel do Windows costuma deixar BOM no começo; ele viraria parte do
  // primeiro cabeçalho e quebraria o mapeamento de colunas em silêncio.
  const text = content.replace(/^﻿/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

function buildIndex(header: string[]): Record<ColumnKey, number> {
  const normalized = header.map((item) => item.trim().toLowerCase());
  const index = {} as Record<ColumnKey, number>;

  for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
    index[key] = -1;
    for (const candidate of COLUMNS[key]) {
      const position = normalized.indexOf(candidate.toLowerCase());
      if (position >= 0) {
        index[key] = position;
        break;
      }
    }
  }

  return index;
}

function text(row: string[], position: number): string {
  return position >= 0 ? (row[position] ?? "").trim() : "";
}

function money(row: string[], position: number): number {
  const raw = text(row, position);
  if (!raw) return 0;
  // Exportação em pt-BR usa vírgula decimal; em en-US, ponto.
  const normalized =
    raw.includes(",") && !raw.includes(".")
      ? raw.replace(",", ".")
      : raw.replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

/** "2026-08-26 16:43:01" não tem fuso: a Wise exporta no horário da conta. */
function parseDate(value: string): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Tipo da movimentação a partir do prefixo do identificador da Wise.
 * Guardado porque é o que distingue compra no cartão de transferência recebida
 * na hora de conferir uma linha suspeita.
 */
function movementType(
  externalId: string,
  direction: "CREDIT" | "DEBIT",
): string {
  const prefix = externalId.split("-")[0];
  const map: Record<string, string> = {
    CARD_TRANSACTION: direction === "DEBIT" ? "CARD_PURCHASE" : "CARD_REFUND",
    TRANSFER: direction === "DEBIT" ? "TRANSFER_SENT" : "TRANSFER_RECEIVED",
    DIRECT_DEBIT_TRANSACTION: "DIRECT_DEBIT",
    BALANCE_CASHBACK: "CASHBACK",
    BALANCE_TRANSACTION:
      direction === "DEBIT" ? "CONVERSION_OUT" : "CONVERSION_IN",
  };
  return map[prefix] ?? (direction === "DEBIT" ? "DEBIT" : "CREDIT");
}

function describe(
  type: string,
  counterparty: string | null,
  message: string,
): string {
  const base: Record<string, string> = {
    CARD_PURCHASE: "Compra no cartão",
    CARD_REFUND: "Estorno de compra",
    TRANSFER_SENT: "Transferência enviada",
    TRANSFER_RECEIVED: "Transferência recebida",
    DIRECT_DEBIT: "Débito automático",
    CASHBACK: "Cashback Wise",
    CONVERSION_OUT: "Conversão de saldo (saída)",
    CONVERSION_IN: "Conversão de saldo (entrada)",
  };
  const label = base[type] ?? "Movimentação";
  const parts = [label];
  if (counterparty) parts.push(counterparty);
  if (message) parts.push(message.slice(0, 80));
  return parts.join(" · ");
}

export function parseWiseCsv(content: string): WiseParseResult {
  const rows = parseCsv(content);
  const skipped: Array<{ line: number; reason: string }> = [];

  if (rows.length === 0) {
    return {
      movements: [],
      skipped: [{ line: 0, reason: "Arquivo vazio" }],
      currencies: [],
    };
  }

  const index = buildIndex(rows[0]);
  if (index.id < 0 || index.direction < 0 || index.sourceCurrency < 0) {
    throw new Error(
      "Este arquivo não parece um extrato da Wise: faltam as colunas de identificador, direção ou moeda.",
    );
  }

  const movements: WiseMovement[] = [];
  const currencies = new Set<string>();

  for (let position = 1; position < rows.length; position += 1) {
    const row = rows[position];
    const line = position + 1;
    const externalId = text(row, index.id);
    const status = text(row, index.status).toUpperCase();
    const direction = text(row, index.direction).toUpperCase();

    if (!externalId) {
      skipped.push({ line, reason: "Linha sem identificador" });
      continue;
    }
    if (status === "CANCELLED" || status === "CANCELADA") {
      skipped.push({ line, reason: "Transferência cancelada" });
      continue;
    }

    const occurredAt =
      parseDate(text(row, index.finishedAt)) ??
      parseDate(text(row, index.createdAt));
    if (!occurredAt) {
      skipped.push({ line, reason: "Linha sem data utilizável" });
      continue;
    }

    const sourceName = text(row, index.sourceName) || null;
    const targetName = text(row, index.targetName) || null;
    const category = text(row, index.category) || null;
    const reference = text(row, index.reference) || null;
    const message = text(row, index.message);
    const sourceCurrency = text(row, index.sourceCurrency).toUpperCase();
    const targetCurrency =
      text(row, index.targetCurrency).toUpperCase() || sourceCurrency;
    const sourceAmount = money(row, index.sourceAmount);
    const targetAmount = money(row, index.targetAmount) || sourceAmount;
    const rawHash = createHash("sha256").update(row.join("")).digest("hex");

    const build = (
      leg: "" | ":out" | ":in",
      currency: string,
      amount: number,
      movementDirection: "CREDIT" | "DEBIT",
      isInternalTransfer: boolean,
    ): WiseMovement => {
      const type = movementType(externalId, movementDirection);
      const counterparty =
        movementDirection === "DEBIT" ? targetName : sourceName;
      return {
        currency,
        externalId: `${externalId}${leg}`,
        direction: movementDirection,
        transactionType: type,
        amount,
        description: describe(
          type,
          isInternalTransfer ? null : counterparty,
          message,
        ),
        counterpartyName: isInternalTransfer ? null : counterparty,
        sourceName,
        occurredAt,
        category,
        reference,
        status,
        isInternalTransfer,
        rawHash,
      };
    };

    // Conversão entre saldos próprios: sai de uma moeda, entra na outra.
    // Sem as duas pernas, o saldo em EUR nunca bate com o extrato.
    if (direction === "NEUTRAL") {
      if (sourceAmount > 0) {
        movements.push(build(":out", sourceCurrency, sourceAmount, "DEBIT", true));
        currencies.add(sourceCurrency);
      }
      if (targetAmount > 0) {
        movements.push(build(":in", targetCurrency, targetAmount, "CREDIT", true));
        currencies.add(targetCurrency);
      }
      continue;
    }

    if (direction === "OUT") {
      if (sourceAmount <= 0) {
        skipped.push({ line, reason: "Saída com valor zero" });
        continue;
      }
      movements.push(build("", sourceCurrency, sourceAmount, "DEBIT", false));
      currencies.add(sourceCurrency);
      continue;
    }

    if (direction === "IN") {
      if (targetAmount <= 0) {
        skipped.push({ line, reason: "Entrada com valor zero" });
        continue;
      }
      movements.push(build("", targetCurrency, targetAmount, "CREDIT", false));
      currencies.add(targetCurrency);
      continue;
    }

    skipped.push({ line, reason: `Direção desconhecida: ${direction || "vazia"}` });
  }

  return { movements, skipped, currencies: Array.from(currencies).sort() };
}
