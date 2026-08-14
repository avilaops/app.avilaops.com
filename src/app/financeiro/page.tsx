import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import BalanceCard from "@/components/BalanceCard";
import CashFlowChart from "@/components/CashFlowChart";
import NewLedgerEntryButton from "@/components/NewLedgerEntryButton";
import ReconciliationControl from "@/components/ReconciliationControl";
import SyncButton from "@/components/SyncButton";
import { getAdmin } from "@/lib/auth";
import {
  getFinanceDashboard,
  ReconciliationFilter,
} from "@/lib/dashboard";
import { formatCurrency, formatDateTime } from "@/lib/format";

const filters: Array<{ value: ReconciliationFilter; label: string }> = [
  { value: "ALL", label: "Todas" },
  { value: "PENDING", label: "Pendentes" },
  { value: "REVIEW", label: "Em revisão" },
  { value: "MATCHED", label: "Conciliadas" },
  { value: "IGNORED", label: "Ignoradas" },
];

function statusLabel(status: string) {
  return (
    {
      PENDING: "Pendente",
      REVIEW: "Em revisão",
      MATCHED: "Conciliado",
      IGNORED: "Ignorado",
    }[status] ?? status
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const range = Number.parseInt(params.range ?? "30", 10);
  const filter = filters.some((item) => item.value === params.status)
    ? (params.status as ReconciliationFilter)
    : "ALL";
  const data = await getFinanceDashboard(range, filter);
  const activeSection =
    filter === "PENDING"
      ? "reconciliation"
      : data.days === 90
        ? "transactions"
        : "overview";

  return (
    <AppShell adminName={admin.nome} section={activeSection}>
      <header className="page-header">
        <div>
          <span className="eyebrow">Control room · Financeiro</span>
          <h1>Conciliação sem zona cega.</h1>
          <p>
            Movimentações do Éfi, evidências e decisões em uma única linha
            operacional.
          </p>
        </div>
        <div className="page-header-actions">
          <NewLedgerEntryButton />
          <SyncButton />
        </div>
      </header>

      <section className="connection-strip" aria-label="Estado da integração">
        <div>
          <span className="status-dot" />
          <strong>{data.account?.displayName ?? "Conta Efí Produção"}</strong>
          <span className="environment-tag">PRODUÇÃO</span>
        </div>
        <span>
          Última sincronização:{" "}
          <strong>{formatDateTime(data.account?.lastSyncAt)}</strong>
        </span>
        <span>
          Última execução:{" "}
          <strong className={`run-${data.latestSync?.status?.toLowerCase() ?? "idle"}`}>
            {data.latestSync?.status === "SUCCESS"
              ? "Concluída"
              : data.latestSync?.status === "FAILED"
                ? "Falhou"
                : data.latestSync?.status === "RUNNING"
                  ? "Em andamento"
                  : "Sem histórico"}
          </strong>
        </span>
      </section>

      <section className="metric-grid" aria-label="Resumo financeiro">
        <BalanceCard
          formattedBalance={formatCurrency(data.latestBalance?.availableBalance.toString())}
          capturedAtLabel={`Capturado em ${formatDateTime(data.latestBalance?.capturedAt)}`}
        />
        <article className="metric">
          <span>Entradas · {data.days} dias</span>
          <strong className="positive">
            {formatCurrency(data.metrics.credits)}
          </strong>
          <small>
            {data.metrics.transactionCount} movimentações analisadas
          </small>
        </article>
        <article className="metric">
          <span>Saídas · {data.days} dias</span>
          <strong className="negative">
            {formatCurrency(data.metrics.debits)}
          </strong>
          <small>Fluxo líquido {formatCurrency(data.metrics.net)}</small>
        </article>
        <article className="metric">
          <span>Taxa de conciliação</span>
          <strong>{data.metrics.reconciliationRate.toFixed(1)}%</strong>
          <div className="progress-track" aria-hidden="true">
            <span
              style={{
                width: `${Math.min(100, data.metrics.reconciliationRate)}%`,
              }}
            />
          </div>
        </article>
      </section>

      {data.metrics.attentionCount > 0 ? (
        <section className="attention-band">
          <div>
            <span className="attention-index">
              {String(data.metrics.attentionCount).padStart(2, "0")}
            </span>
            <div>
              <strong>Movimentações precisam de decisão</strong>
              <p>
                {formatCurrency(data.metrics.attentionAmount)} ainda não possui
                vínculo ou evidência confirmada.
              </p>
            </div>
          </div>
          <Link href={`?range=${data.days}&status=PENDING`} className="row-action">
            Abrir fila de conciliação
          </Link>
        </section>
      ) : null}

      <section className="analysis-grid">
        <article className="section-panel chart-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Fluxo de caixa</span>
              <h2>Entradas × saídas</h2>
            </div>
            <div className="range-switch" aria-label="Intervalo">
              {[7, 30, 90, 365].map((days) => (
                <Link
                  href={`?range=${days}&status=${filter}`}
                  className={data.days === days ? "active" : ""}
                  key={days}
                >
                  {days === 365 ? "1 ano" : `${days}d`}
                </Link>
              ))}
            </div>
          </div>
          <CashFlowChart points={data.chart} />
        </article>

        <aside className="section-panel health-panel">
          <span className="eyebrow">Saúde da operação</span>
          <h2>O que merece atenção</h2>
          <dl className="health-list">
            <div>
              <dt>Pendentes</dt>
              <dd>{data.metrics.counts.PENDING ?? 0}</dd>
            </div>
            <div>
              <dt>Em revisão</dt>
              <dd>{data.metrics.counts.REVIEW ?? 0}</dd>
            </div>
            <div>
              <dt>Conciliadas</dt>
              <dd>{data.metrics.counts.MATCHED ?? 0}</dd>
            </div>
            <div>
              <dt>Ignoradas</dt>
              <dd>{data.metrics.counts.IGNORED ?? 0}</dd>
            </div>
          </dl>
          <Link href="/relatorios" className="secondary-button">
            Ver relatórios executivos
          </Link>
        </aside>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <span className="eyebrow">Conciliação</span>
            <h2>Movimentações bancárias</h2>
          </div>
          <div className="filter-tabs" aria-label="Filtrar por estado">
            {filters.map((item) => (
              <Link
                href={`?range=${data.days}&status=${item.value}`}
                className={filter === item.value ? "active" : ""}
                key={item.value}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {data.transactions.length === 0 ? (
          <div className="table-empty">
            <strong>Nenhuma movimentação neste recorte.</strong>
            <span>Ajuste o período ou sincronize a conta do Éfi.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Movimentação</th>
                  <th>Origem / destino</th>
                  <th>Valor</th>
                  <th>Vínculo</th>
                  <th>Estado</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((transaction) => {
                  const reconciliation = transaction.reconciliation;
                  const status = reconciliation?.status ?? "PENDING";
                  return (
                    <tr key={transaction.id.toString()}>
                      <td>
                        <time dateTime={transaction.occurredAt.toISOString()}>
                          {formatDateTime(transaction.occurredAt)}
                        </time>
                      </td>
                      <td>
                        <div className="transaction-kind">
                          <span
                            className={
                              transaction.direction === "CREDIT"
                                ? "direction direction-credit"
                                : "direction direction-debit"
                            }
                          >
                            {transaction.direction === "CREDIT" ? "↙" : "↗"}
                          </span>
                          <span>
                            <strong>{transaction.description}</strong>
                            <small>{transaction.transactionType}</small>
                          </span>
                        </div>
                      </td>
                      <td>{transaction.counterpartyName ?? "Não informado"}</td>
                      <td
                        className={
                          transaction.direction === "CREDIT"
                            ? "money positive"
                            : "money"
                        }
                      >
                        {transaction.direction === "CREDIT" ? "+" : "−"}{" "}
                        {formatCurrency(transaction.amount.toString())}
                      </td>
                      <td>
                        {reconciliation?.referenceId ? (
                          <span className="reference">
                            {reconciliation.referenceType} ·{" "}
                            {reconciliation.referenceId}
                          </span>
                        ) : (
                          <span className="muted">Sem vínculo</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-pill status-${status.toLowerCase()}`}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td>
                        <ReconciliationControl
                          transactionId={transaction.id.toString()}
                          currentStatus={status}
                          referenceType={reconciliation?.referenceType}
                          referenceId={reconciliation?.referenceId}
                          note={reconciliation?.note}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
