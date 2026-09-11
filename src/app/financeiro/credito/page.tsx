import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import LedgerList from "@/components/LedgerList";
import NewLedgerEntryButton from "@/components/NewLedgerEntryButton";
import RegistrarScoreButton from "@/components/RegistrarScoreButton";
import ScoreCard from "@/components/ScoreCard";
import { ehDono, getAdmin } from "@/lib/auth";
import { listLedgerEntries } from "@/lib/contas";
import { resumoDeCredito } from "@/lib/credito";
import { formatCurrency } from "@/lib/format";

/** Onde o número é lido. Todos públicos, todos exigem login da própria pessoa. */
const ondeConferir = [
  { href: "https://www.serasa.com.br/score/", label: "Serasa (CPF)", detalhe: "Score de 0 a 1000 e o que está pesando" },
  { href: "https://empresas.serasaexperian.com.br/", label: "Serasa Experian (CNPJ)", detalhe: "Score e pendências da empresa" },
  { href: "https://registrato.bcb.gov.br/", label: "Registrato (Banco Central)", detalhe: "Empréstimos e dívidas em nome do CPF e do CNPJ" },
];

export default async function CreditoPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

  const [resumos, contas] = await Promise.all([
    resumoDeCredito(),
    listLedgerEntries({ direction: "PAYABLE", status: "OPEN", scope: "ALL" }),
  ]);
  const proximas = [...contas.rows]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 8);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="credito">
      <header className="page-header">
        <div>
          <h1>Score e contas a pagar</h1>
          <p>O score do CPF e do CNPJ, e o que vence, num lugar só.</p>
        </div>
        <div className="page-header-actions">
          <RegistrarScoreButton />
          <NewLedgerEntryButton />
        </div>
      </header>

      <section className="score-grid" aria-label="Score de crédito">
        {resumos.map((resumo) => (
          <ScoreCard key={resumo.subjectKind} resumo={resumo} />
        ))}
      </section>

      <section className="metric-grid" aria-label="Resumo das contas a pagar">
        <article className="metric">
          <span>A pagar em aberto</span>
          <strong className="negative">{formatCurrency(contas.totals.openPayable)}</strong>
          <small>{contas.rows.length} conta{contas.rows.length === 1 ? "" : "s"}</small>
        </article>
        <article className="metric">
          <span>Já vencidas</span>
          <strong className={contas.totals.overduePayable > 0 ? "negative" : ""}>
            {formatCurrency(contas.totals.overduePayable)}
          </strong>
          <small>
            {contas.totals.overdueCount > 0
              ? `${contas.totals.overdueCount} em atraso`
              : "Nada em atraso"}
          </small>
        </article>
        <article className="metric">
          <span>Vencem em 7 dias</span>
          <strong>{contas.totals.dueNext7Days}</strong>
          <small>Empresa e pessoal</small>
        </article>
      </section>

      <section className="section-panel transactions-panel">
        <div className="section-heading table-heading">
          <div>
            <span className="eyebrow">Contas a pagar</span>
            <h2>Próximos vencimentos</h2>
          </div>
          <Link
            href="/financeiro/contas?direction=PAYABLE&status=OPEN&scope=ALL"
            className="secondary-button"
          >
            Ver todas
          </Link>
        </div>
        {proximas.length === 0 ? (
          <div className="table-empty">
            <strong>Nenhuma conta a pagar em aberto.</strong>
            <span>Lance um compromisso em &ldquo;Novo lançamento&rdquo;.</span>
          </div>
        ) : (
          <LedgerList rows={proximas} />
        )}
      </section>

      <section className="section-panel fontes-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Onde conferir</span>
            <h2>Fontes do score</h2>
          </div>
        </div>
        <ul className="ios-list fontes-list">
          {ondeConferir.map((fonte) => (
            <li key={fonte.href}>
              <a
                className="ios-row"
                href={fonte.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="ios-row-label">
                  <strong>{fonte.label}</strong>
                  <small>{fonte.detalhe}</small>
                </span>
                <span className="muted" aria-hidden="true">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
