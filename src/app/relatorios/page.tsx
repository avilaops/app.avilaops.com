import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { ehDono, getAdmin } from "@/lib/auth";
import { getFinanceDashboard } from "@/lib/dashboard";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default async function ReportsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");
  const data = await getFinanceDashboard(30, "ALL");

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="reports">
      <header className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Exporte dados conciliados e acompanhe a qualidade da integração.</p>
        </div>
        <Link href="/financeiro" className="secondary-button">
          Voltar ao painel
        </Link>
      </header>

      <section className="report-hero">
        <div>
          <span>Resumo · últimos 30 dias</span>
          <strong>{formatCurrency(data.metrics.net)}</strong>
          <small>Fluxo líquido no período</small>
        </div>
        <dl>
          <div>
            <dt>Entradas</dt>
            <dd>{formatCurrency(data.metrics.credits)}</dd>
          </div>
          <div>
            <dt>Saídas</dt>
            <dd>{formatCurrency(data.metrics.debits)}</dd>
          </div>
          <div>
            <dt>Conciliação</dt>
            <dd>{data.metrics.reconciliationRate.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Atualização</dt>
            <dd>{formatDateTime(data.account?.lastSyncAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="reports-list">
        <article>
          <span className="report-number">01</span>
          <div>
            <h2>Movimentações bancárias</h2>
            <p>
              Entradas, saídas, contraparte, vínculo e estado de conciliação.
            </p>
          </div>
          <a
            href="/api/reports/transactions?range=30"
            className="secondary-button"
          >
            Exportar CSV
          </a>
        </article>
        <article>
          <span className="report-number">02</span>
          <div>
            <h2>Fila de pendências</h2>
            <p>
              Somente movimentações que ainda precisam de decisão ou evidência.
            </p>
          </div>
          <a
            href="/api/reports/transactions?range=90&status=PENDING"
            className="secondary-button"
          >
            Exportar CSV
          </a>
        </article>
        <article>
          <span className="report-number">03</span>
          <div>
            <h2>Resumo executivo</h2>
            <p>
              Saldo, fluxo, taxa de conciliação e saúde da sincronização.
            </p>
          </div>
          <a href="/api/reports/summary?range=30" className="secondary-button">
            Exportar CSV
          </a>
        </article>
      </section>

      <section className="report-note">
        <span className="status-dot" />
        <div>
          <strong>Relatórios rastreáveis</strong>
          <p>
            Cada exportação gera evento de auditoria. Nenhum relatório contém
            certificado, token, documento fiscal do pagador ou chave Pix.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
