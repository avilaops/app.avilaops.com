import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AutoReconcileButton from "@/components/AutoReconcileButton";
import BalanceCard from "@/components/BalanceCard";
import CashFlowChart from "@/components/CashFlowChart";
import NewLedgerEntryButton from "@/components/NewLedgerEntryButton";
import SyncButton from "@/components/SyncButton";
import TransactionList, {
  type LinhaMovimentacao,
} from "@/components/TransactionList";
import { ehDono, getAdmin } from "@/lib/auth";
import {
  getFinanceDashboard,
  ReconciliationFilter,
  ScopeFilter,
} from "@/lib/dashboard";
import { isFinanceScope, type FinanceScope } from "@/lib/finance-escopo";
import { formatCurrency, formatDateTime } from "@/lib/format";

const scopeFilters: Array<{ value: ScopeFilter; label: string }> = [
  { value: "ALL", label: "Tudo" },
  { value: "EMPRESA", label: "Empresa" },
  { value: "PESSOAL", label: "Pessoal" },
  { value: "INDEFINIDO", label: "A classificar" },
];

const filters: Array<{ value: ReconciliationFilter; label: string }> = [
  { value: "ALL", label: "Todas" },
  { value: "PENDING", label: "Pendentes" },
  { value: "REVIEW", label: "Em revisão" },
  { value: "MATCHED", label: "Conciliadas" },
  { value: "IGNORED", label: "Ignoradas" },
];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    status?: string;
    conta?: string;
    escopo?: string;
  }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const params = await searchParams;
  const range = Number.parseInt(params.range ?? "30", 10);
  const filter = filters.some((item) => item.value === params.status)
    ? (params.status as ReconciliationFilter)
    : "ALL";
  const scope: ScopeFilter = isFinanceScope(params.escopo ?? "")
    ? (params.escopo as FinanceScope)
    : "ALL";
  const data = await getFinanceDashboard(range, filter, {
    accountId: params.conta ?? null,
    scope,
  });
  const currency = data.account?.currency ?? "BRL";
  const link = (next: Record<string, string>) => {
    const search = new URLSearchParams({
      range: String(data.days),
      status: filter,
      escopo: scope,
      conta: data.account?.id ?? "",
      ...next,
    });
    return `?${search.toString()}`;
  };
  const activeSection =
    filter === "PENDING"
      ? "reconciliation"
      : data.days === 90
        ? "transactions"
        : "overview";

  // Decimal e BigInt não atravessam a fronteira do componente: viram texto aqui.
  const linhas: LinhaMovimentacao[] = data.transactions.map((transaction) => ({
    id: transaction.id.toString(),
    occurredAt: transaction.occurredAt.toISOString(),
    description: transaction.description,
    transactionType: transaction.transactionType,
    counterpartyName: transaction.counterpartyName ?? null,
    direction: transaction.direction,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    scope: transaction.scope,
    scopeSource: transaction.scopeSource ?? null,
    reconciliation: transaction.reconciliation
      ? {
          status: transaction.reconciliation.status,
          referenceType: transaction.reconciliation.referenceType ?? null,
          referenceId: transaction.reconciliation.referenceId ?? null,
          note: transaction.reconciliation.note ?? null,
        }
      : null,
  }));

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section={activeSection}>
      <header className="page-header">
        <div>
          <h1>Financeiro</h1>
          <p>Movimentações do Efí, evidências e o que ainda depende de decisão.</p>
        </div>
        <div className="page-header-actions">
          <Link href="/financeiro/contas" className="secondary-button">
            Contas a pagar e receber
          </Link>
          <NewLedgerEntryButton />
          <AutoReconcileButton />
          <SyncButton />
        </div>
      </header>

      <section className="connection-strip" aria-label="Estado da integração">
        <div className="account-switch" role="group" aria-label="Conta">
          <span className="status-dot" />
          {data.accounts.length === 0 ? (
            <strong>Conta Efí Produção</strong>
          ) : (
            data.accounts.map((item) => (
              <Link
                href={link({ conta: item.id })}
                className={data.account?.id === item.id ? "active" : ""}
                key={item.id}
              >
                {item.displayName}
              </Link>
            ))
          )}
          {data.account?.provider === "wise" ? (
            <Link href="/financeiro/importar" className="environment-tag">
              IMPORTAR CSV
            </Link>
          ) : (
            <span className="environment-tag">PRODUÇÃO</span>
          )}
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
          formattedBalance={
            data.latestBalance
              ? formatCurrency(
                  data.latestBalance.availableBalance.toString(),
                  currency,
                )
              : "-"
          }
          capturedAtLabel={
            data.latestBalance
              ? `Capturado em ${formatDateTime(data.latestBalance.capturedAt)}`
              : "Extrato importado por arquivo não traz saldo"
          }
        />
        <article className="metric">
          <span>Entradas · {data.days} dias</span>
          <strong className="positive">
            {formatCurrency(data.metrics.credits, currency)}
          </strong>
          <small>
            {data.metrics.transactionCount} movimentações analisadas
            {data.metrics.internalCount > 0
              ? ` · ${data.metrics.internalCount} entre contas fora do resultado`
              : ""}
          </small>
        </article>
        <article className="metric">
          <span>Saídas · {data.days} dias</span>
          <strong className="negative">
            {formatCurrency(data.metrics.debits, currency)}
          </strong>
          <small>
            Fluxo líquido {formatCurrency(data.metrics.net, currency)}
          </small>
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
                {formatCurrency(data.metrics.attentionAmount, currency)} ainda
                não possui vínculo ou evidência confirmada.
              </p>
            </div>
          </div>
          <Link href={link({ status: "PENDING" })} className="row-action">
            Abrir fila de conciliação
          </Link>
        </section>
      ) : null}

      <section className="analysis-grid">
        <article className="section-panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>Entradas × saídas</h2>
            </div>
            <div className="range-switch" aria-label="Intervalo">
              {[7, 30, 90, 365].map((days) => (
                <Link
                  href={link({ range: String(days) })}
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
            <h2>Movimentações bancárias</h2>
          </div>
          <div className="filter-tabs" aria-label="Filtrar por estado">
            {filters.map((item) => (
              <Link
                href={link({ status: item.value })}
                className={filter === item.value ? "active" : ""}
                key={item.value}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="section-heading table-heading">
          <p className="muted scope-explainer">
            Uma conta só paga o mercado e paga o Porkbun. A separação acontece
            aqui: o que estiver como Empresa entra no resultado da Ávila,
            &ldquo;entre contas&rdquo; nunca entra.
          </p>
          <div className="filter-tabs" aria-label="Filtrar por escopo">
            {scopeFilters.map((item) => (
              <Link
                href={link({ escopo: item.value })}
                className={scope === item.value ? "active" : ""}
                key={item.value}
              >
                {item.label}
                {item.value !== "ALL" && data.metrics.scopeCounts[item.value]
                  ? ` · ${data.metrics.scopeCounts[item.value]}`
                  : ""}
              </Link>
            ))}
          </div>
        </div>

        {linhas.length === 0 ? (
          <div className="table-empty">
            <strong>Nenhuma movimentação neste recorte.</strong>
            <span>
              Ajuste o período, sincronize o Éfi ou importe o extrato da Wise.
            </span>
          </div>
        ) : (
          <TransactionList transactions={linhas} />
        )}
      </section>
    </AppShell>
  );
}
