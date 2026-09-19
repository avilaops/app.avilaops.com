import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { contextoDaSecao } from "@/lib/navegacao";
import LedgerList from "@/components/LedgerList";
import MetaLimparNome from "@/components/MetaLimparNome";
import NewLedgerEntryButton from "@/components/NewLedgerEntryButton";
import RegistrarScoreButton from "@/components/RegistrarScoreButton";
import ScoreCard from "@/components/ScoreCard";
import { ehDono, getAdmin } from "@/lib/auth";
import { listLedgerEntries } from "@/lib/contas";
import { progressoDaMeta, resumoDeCredito, SERASA_REFERENCE } from "@/lib/credito";
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

  const [resumos, contas, serasa] = await Promise.all([
    resumoDeCredito(),
    // As demais contas: as anotações do Serasa têm bloco próprio abaixo.
    listLedgerEntries({
      direction: "PAYABLE",
      status: "OPEN",
      scope: "ALL",
      excetoReferenceType: SERASA_REFERENCE,
    }),
    listLedgerEntries({
      direction: "PAYABLE",
      status: "ALL",
      scope: "ALL",
      referenceType: SERASA_REFERENCE,
    }),
  ]);
  const proximas = [...contas.rows]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 8);
  const meta = progressoDaMeta(serasa.rows);
  // Em aberto primeiro, da menor para a maior: é a ordem de ataque para quem
  // quita aos poucos. Quitadas e canceladas vão para o fim.
  const anotacoes = [...serasa.rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
    return Number(a.amount) - Number(b.amount);
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="credito">
      <CabecalhoTela
        titulo="Score e contas a pagar"
        descricao="O score do CPF e do CNPJ, e o que vence, num lugar só."
        {...contextoDaSecao("credito")}
        acoes={
          <>
          <div className="page-header-actions">
          <RegistrarScoreButton />
          <NewLedgerEntryButton />
          </div>
          </>
        }
      />

      <section className="score-grid" aria-label="Score de crédito">
        {resumos.map((resumo) => (
          <ScoreCard key={resumo.subjectKind} resumo={resumo} />
        ))}
      </section>

      {serasa.rows.length > 0 ? (
        <>
          <MetaLimparNome meta={meta} />
          <section className="section-panel transactions-panel">
            <div className="section-heading table-heading">
              <div>
                <span className="eyebrow">Anotações no Serasa</span>
                <h2>Da menor para a maior</h2>
              </div>
              <p className="scope-explainer">
                Valor anotado no extrato. Se o acordo sair por menos, dê baixa e
                anote o valor pago na nota.
              </p>
            </div>
            <LedgerList rows={anotacoes} />
          </section>
        </>
      ) : null}

      <section className="metric-grid" aria-label="Resumo das outras contas a pagar">
        <article className="metric">
          <span>Outras contas em aberto</span>
          <strong className="negative">
            {formatCurrency(contas.rows.reduce((soma, r) => soma + Number(r.amount), 0))}
          </strong>
          <small>{contas.rows.length} conta{contas.rows.length === 1 ? "" : "s"}, fora o Serasa</small>
        </article>
        <article className="metric">
          <span>Já vencidas</span>
          <strong className={contas.rows.some((r) => r.overdue) ? "negative" : ""}>
            {formatCurrency(
              contas.rows.filter((r) => r.overdue).reduce((soma, r) => soma + Number(r.amount), 0),
            )}
          </strong>
          <small>
            {contas.rows.filter((r) => r.overdue).length > 0
              ? `${contas.rows.filter((r) => r.overdue).length} em atraso`
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
            <span className="eyebrow">Outras contas a pagar</span>
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
