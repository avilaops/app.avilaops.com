/**
 * Uma movimentação como a tela recebe. Decimal e BigInt não atravessam a
 * fronteira do componente de cliente: viram texto na página de servidor.
 */
export type LinhaMovimentacao = {
  id: string;
  occurredAt: string;
  description: string;
  transactionType: string;
  counterpartyName: string | null;
  counterpartyDocument: string | null;
  counterpartySource: string | null;
  endToEndId: string | null;
  direction: string;
  amount: string;
  currency: string;
  scope: string;
  scopeSource: string | null;
  category: string | null;
  reconciliation: {
    status: string;
    referenceType: string | null;
    referenceId: string | null;
    note: string | null;
  } | null;
};
