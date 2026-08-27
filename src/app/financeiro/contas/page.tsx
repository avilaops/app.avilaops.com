import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import LedgerRowActions from "@/components/LedgerRowActions";
import NewLedgerEntryButton from "@/components/NewLedgerEntryButton";
import { getAdmin } from "@/lib/auth";
import {
  LEDGER_DIRECTIONS,
  LEDGER_STATUSES,
  listLedgerEntries,
  type LedgerDirection,
  type LedgerStatus,
} from "@/lib/contas";
import { isFinanceScope, SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";
import { formatCurrency, formatShortDate } from "@/lib/format";

const directionTabs: Array<{ value: LedgerDirection | "ALL"; label: string }> = [
  { value: "ALL", label: "Tudo" },
  { value: "RECEIVABLE", label: "A receber" },
  { value: "PAYABLE", label: "A pagar" },
];

const statusTabs: Array<{ value: LedgerStatus | "OVERDUE" | "ALL"; label: string }> = [
  { value: "OPEN", label: "Em aberto" },
  { value: "OVERDUE", label: "Vencidas" },
  { value: "PAID", label: "Quitadas" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "ALL", label: "Todas" },
];

const scopeTabs: Array<{ value: FinanceScope | "ALL"; label: string }> = [
  { value: "EMPRESA", label: "Empresa" },
  { value: "PESSOAL", label: "Pessoal" },
  { value: "ALL", label: "Tudo" },
];

function statusLabel(status: string, overdue: boolean) {
  if (overdue) return "Vencida";
  return (
    { OPEN: "Em aberto", PAID: "Quitada", CANCELLED: "Cancelada" }[status] ??
    status
  );
}

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; status?: string; scope?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const direction = (LEDGER_DIRECTIONS as readonly string[]).includes(
    params.direction ?? "",
  )
    ? (params.direction as LedgerDirection)
    : "ALL";
  const status =
    params.status === "OVERDUE" ||
    (LEDGER_STATUSES as readonly string[]).includes(params.status ?? "")
      ? (params.status as LedgerStatus | "OVERDUE")
      : "OPEN";
  // O padrão é Empresa: contas a pagar da Ávila é o que esta tela existe para
  // responder. O pessoal continua a um clique, não escondido.
  const scope = isFinanceScope(params.scope ?? "")
    ? (params.scope as FinanceScope)
    : params.scope === "ALL"
      ? "ALL"
      : "EMPRESA";

  const { rows, totals } = await listLedgerEntries({ direction, status, scope });

  const query = (next: Record<string, string>) => {
    const search = new URLSearchParams({ direction, status, scope, ...next });
    return `?${search.toString()}`;
  };

  return (
    <AppShell adminName={admin.nome} section="ledger">
      <header className="page-header">
        <div>
          <h1>Contas a pagar e receber</h1>
          <p>O que vence, o que já venceu e o que a conciliação bancária deu por quitado.</p>
        </div>
        <div className="page-header-actions">
          <NewLedgerEntryButton />
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumo das contas">
        <article className="metric">
          <span>A receber em aberto</span>
          <strong className="positive">
            {formatCurrency(totals.openReceivable)}
          </strong>
          <small>
            {totals.overdueReceivable > 0
              ? `${formatCurrency(totals.overdueReceivable)} já vencido`
              : "Nada vencido"}
          </small>
        </article>
        <article className="metric">
          <span>A pagar em aberto</span>
          <strong className="negative">
            {formatCurrency(totals.openPayable)}
          </strong>
          <small>
            {totals.overduePayable > 0
              ? `${formatCurrency(totals.overduePayable)} já vencido`
              : "Nada vencido"}
          </small>
        </article>
        <article className="metric">
          <span>Saldo projetado</span>
          <strong className={totals.projectedNet >= 0 ? "positive" : "negative"}>
            {formatCurrency(totals.projectedNet)}
          </strong>
          <small>Recebíveis menos obrigações em aberto</small>
        </article>
        <article className="metric">
          <span>Vencem em 7 dias</span>
          <strong>{totals.dueNext7Days}</strong>
          <small>{totals.overdueCount} contas já vencidas</small>
        </article>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <span className="eyebrow">Lançamentos</span>
            <h2>
              {scope === "ALL"
                ? "Empresa e pessoal"
                : SCOPE_LABELS[scope as FinanceScope]}
            </h2>
          </div>
          <div className="filter-tabs" aria-label="Escopo">
            {scopeTabs.map((item) => (
              <Link
                href={query({ scope: item.value })}
                className={scope === item.value ? "active" : ""}
                key={item.value}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="section-heading table-heading">
          <div className="filter-tabs" aria-label="Tipo">
            {directionTabs.map((item) => (
              <Link
                href={query({ direction: item.value })}
                className={direction === item.value ? "active" : ""}
                key={item.value}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="filter-tabs" aria-label="Situação">
            {statusTabs.map((item) => (
              <Link
                href={query({ status: item.value })}
                className={status === item.value ? "active" : ""}
                key={item.value}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="table-empty">
            <strong>Nenhuma conta neste recorte.</strong>
            <span>
              Lance um compromisso em &ldquo;Novo lançamento&rdquo; ou troque o
              filtro.
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Lançamento</th>
                  <th>Contraparte</th>
                  <th>Valor</th>
                  <th>Escopo</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.overdue ? "row-overdue" : ""}>
                    <td>
                      <time dateTime={row.dueDate.toISOString()}>
                        {formatShortDate(row.dueDate)}
                      </time>
                      {row.overdue ? (
                        <small className="negative">
                          {row.daysLate} dia{row.daysLate === 1 ? "" : "s"} de
                          atraso
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{row.description}</strong>
                      {row.category ? <small>{row.category}</small> : null}
                    </td>
                    <td>
                      {row.counterparty ?? <span className="muted">—</span>}
                    </td>
                    <td
                      className={
                        row.direction === "RECEIVABLE" ? "money positive" : "money"
                      }
                    >
                      {row.direction === "RECEIVABLE" ? "+" : "−"}{" "}
                      {formatCurrency(row.amount, row.currency)}
                    </td>
                    <td>
                      <span className={`status-pill scope-${row.scope.toLowerCase()}`}>
                        {SCOPE_LABELS[row.scope as FinanceScope] ?? row.scope}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill status-${row.overdue ? "overdue" : row.status.toLowerCase()}`}
                      >
                        {statusLabel(row.status, row.overdue)}
                      </span>
                      {row.referenceType === "BANK_TRANSACTION" ? (
                        <small className="muted">conciliada com o extrato</small>
                      ) : null}
                    </td>
                    <td>
                      <LedgerRowActions
                        entryId={row.id}
                        status={row.status}
                        direction={row.direction}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
