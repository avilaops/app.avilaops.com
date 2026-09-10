import LedgerRowActions from "@/components/LedgerRowActions";
import type { LedgerRow } from "@/lib/contas";
import { SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";
import { formatCurrency, formatShortDate } from "@/lib/format";

function rotuloSituacao(status: string, overdue: boolean) {
  if (overdue) return "Vencida";
  return (
    { OPEN: "Em aberto", PAID: "Quitada", CANCELLED: "Cancelada" }[status] ??
    status
  );
}

/**
 * Contas a pagar e receber como lista em grade, no mesmo desenho das
 * movimentações (`TransactionList`): tabela no desktop, cartão de três andares
 * no celular (o quê + valor, quem + quando, escopo + situação, ação). Um DOM
 * só; quem muda de forma é o CSS.
 */
export default function LedgerList({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="lg-list" role="table" aria-label="Contas a pagar e receber">
      <div className="lg-head" role="row">
        <span role="columnheader">Vencimento</span>
        <span role="columnheader">Lançamento</span>
        <span role="columnheader">Contraparte</span>
        <span role="columnheader" className="lg-amount">
          Valor
        </span>
        <span role="columnheader">Escopo</span>
        <span role="columnheader">Situação</span>
        <span role="columnheader" aria-label="Ações" />
      </div>

      {rows.map((row) => {
        const receber = row.direction === "RECEIVABLE";
        return (
          <div
            className={row.overdue ? "lg-row lg-row-overdue" : "lg-row"}
            role="row"
            key={row.id}
          >
            <span className="lg-due" role="cell">
              <time dateTime={row.dueDate.toISOString()}>
                {formatShortDate(row.dueDate)}
              </time>
              {row.overdue ? (
                <small className="negative">
                  {row.daysLate} dia{row.daysLate === 1 ? "" : "s"} de atraso
                </small>
              ) : null}
            </span>

            <span className="lg-kind" role="cell">
              <strong>{row.description}</strong>
              {row.category ? <small>{row.category}</small> : null}
            </span>

            <span className="lg-party" role="cell">
              {row.counterparty ?? <span className="muted">Sem contraparte</span>}
            </span>

            <span
              className={receber ? "lg-amount money positive" : "lg-amount money"}
              role="cell"
            >
              {receber ? "+" : "−"} {formatCurrency(row.amount, row.currency)}
            </span>

            <span className="lg-scope" role="cell">
              <span className={`status-pill scope-${row.scope.toLowerCase()}`}>
                {SCOPE_LABELS[row.scope as FinanceScope] ?? row.scope}
              </span>
            </span>

            <span className="lg-state" role="cell">
              <span
                className={`status-pill status-${row.overdue ? "overdue" : row.status.toLowerCase()}`}
              >
                {rotuloSituacao(row.status, row.overdue)}
              </span>
              {row.referenceType === "BANK_TRANSACTION" ? (
                <small className="muted">conciliada com o extrato</small>
              ) : null}
            </span>

            <span className="lg-actions" role="cell">
              <LedgerRowActions
                entryId={row.id}
                status={row.status}
                direction={row.direction}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
