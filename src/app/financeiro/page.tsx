import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AcoesCabecalho from "@/components/financeiro/AcoesCabecalho";
import CabecalhoFinanceiro from "@/components/financeiro/CabecalhoFinanceiro";
import { AbasLink, FiltroSelect } from "@/components/financeiro/Filtros";
import GraficoFluxo from "@/components/financeiro/GraficoFluxo";
import { FaixaIndicadores, Indicador } from "@/components/financeiro/Indicadores";
import Painel from "@/components/financeiro/Painel";
import SeletorConta from "@/components/financeiro/SeletorConta";
import TabelaMovimentacoes, { type LinhaMovimentacao } from "@/components/financeiro/TabelaMovimentacoes";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { Button } from "@/components/shadcn/button";
import { ehDono, getAdmin } from "@/lib/auth";
import { getFinanceDashboard, ReconciliationFilter, ScopeFilter } from "@/lib/dashboard";
import { isFinanceScope, type FinanceScope } from "@/lib/finance-escopo";
import { rotuloInstituicao } from "@/lib/financeiro-rotulos";
import { contar, formatCurrency, formatDateTime, formatPercent } from "@/lib/format";

const scopeFilters: Array<{ value: ScopeFilter; label: string }> = [
  { value: "ALL", label: "Tudo" },
  { value: "EMPRESA", label: "Empresa" },
  { value: "PESSOAL", label: "Pessoal" },
  { value: "INTERNO", label: "Entre contas" },
  { value: "INDEFINIDO", label: "A classificar" },
];

const filters: Array<{ value: ReconciliationFilter; label: string }> = [
  { value: "ALL", label: "Todas" },
  { value: "PENDING", label: "Pendentes" },
  { value: "REVIEW", label: "Em revisão" },
  { value: "MATCHED", label: "Conciliadas" },
  { value: "IGNORED", label: "Ignoradas" },
];

const periodos = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "1 ano" },
];

const ESTADO_SYNC: Record<string, string> = {
  SUCCESS: "concluída",
  FAILED: "falhou",
  RUNNING: "em andamento",
};

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
  const link = (next: Record<string, string>, ancora = "") => {
    const search = new URLSearchParams({
      range: String(data.days),
      status: filter,
      escopo: scope,
      conta: data.account?.id ?? "",
      ...next,
    });
    return `?${search.toString()}${ancora}`;
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
    counterpartyDocument: transaction.counterpartyDocument ?? null,
    counterpartySource: transaction.counterpartySource ?? null,
    endToEndId: transaction.endToEndId ?? null,
    direction: transaction.direction,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    scope: transaction.scope,
    scopeSource: transaction.scopeSource ?? null,
    category: transaction.category ?? null,
    reconciliation: transaction.reconciliation
      ? {
          status: transaction.reconciliation.status,
          referenceType: transaction.reconciliation.referenceType ?? null,
          referenceId: transaction.reconciliation.referenceId ?? null,
          note: transaction.reconciliation.note ?? null,
        }
      : null,
  }));

  const contas = data.accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    displayName: a.displayName,
    currency: a.currency,
    environment: a.environment,
  }));
  const contaAtual = contas.find((c) => c.id === data.account?.id) ?? null;
  const hrefPorConta = Object.fromEntries(contas.map((c) => [c.id, link({ conta: c.id })]));
  const net = data.metrics.net;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section={activeSection}>
      <CabecalhoFinanceiro
        titulo="Financeiro"
        acoes={[{ tipo: "sincronizar" }, { tipo: "novo-lancamento" }, { tipo: "link", rotulo: "Integrações", icone: "cobranca", href: "/financeiro/integracoes" }, { tipo: "link", rotulo: "Revisar pendências", icone: "revisar", href: link({ status: "PENDING" }, "#movimentacoes") }]}
        descricao="Saldo, entradas e saídas da conta escolhida, e o que ainda depende de decisão."
      />

      {/* Conta e período valem para a página inteira: ficam juntos, no topo,
          em vez de o período morar dentro do gráfico e a conta numa fila de
          texto solto. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 max-[820px]:w-full">
          <SeletorConta contas={contas} atual={contaAtual} hrefDe={hrefPorConta} />
        </div>
        <div className="min-w-0 max-[820px]:w-full">
          <AbasLink
            rotulo="Período"
            abas={periodos.map((p) => ({ href: link({ range: String(p.dias) }), rotulo: p.rotulo, ativa: data.days === p.dias }))}
          />
        </div>
        <p className="m-0 text-[13px] text-muted-foreground min-[821px]:ml-auto">
          {data.account?.lastSyncAt ? (
            <>
              Última atualização em <span className="text-foreground">{formatDateTime(data.account.lastSyncAt)}</span>
              {data.latestSync?.status ? (
                <span className={data.latestSync.status === "FAILED" ? "text-[color:var(--red)]" : undefined}>
                  {" "}
                  (última tentativa: {ESTADO_SYNC[data.latestSync.status] ?? "sem histórico"})
                </span>
              ) : null}
            </>
          ) : (
            "Ainda não sincronizada"
          )}
        </p>
      </div>

      <FaixaIndicadores rotulo="Resumo financeiro">
        <Indicador
          rotulo={data.latestBalance ? "Saldo disponível" : "Saldo indisponível"}
          valor={data.latestBalance ? formatCurrency(data.latestBalance.availableBalance.toString(), currency) : "Saldo indisponível"}
          detalhe={
            data.latestBalance
              ? `Capturado em ${formatDateTime(data.latestBalance.capturedAt)}`
              : data.account?.provider === "wise" ? "O arquivo importado não informou saldo; isso não significa saldo zero." : "Nenhum saldo foi informado pela integração."
          }
          ocultavel={Boolean(data.latestBalance)}
        />
        <Indicador
          rotulo={`Entradas em ${data.days} dias`}
          valor={formatCurrency(data.metrics.credits, currency)}
          tom="entrada"
          detalhe={contar(data.metrics.transactionCount, "movimentação analisada", "movimentações analisadas")}
        />
        <Indicador
          rotulo={`Saídas em ${data.days} dias`}
          valor={formatCurrency(data.metrics.debits, currency)}
          tom="saida"
          detalhe={
            data.metrics.internalCount > 0
              ? `${contar(data.metrics.internalCount, "transferência", "transferências")} entre contas fora do resultado`
              : "Sem transferências entre contas"
          }
        />
        <Indicador
          rotulo="Resultado"
          valor={formatCurrency(net, currency)}
          tom={net > 0 ? "entrada" : net < 0 ? "saida" : "neutro"}
          detalhe="Entradas menos saídas no período"
        />
      </FaixaIndicadores>

      {data.metrics.attentionCount > 0 ? (
        <section
          aria-label="Pendências"
          className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-card px-4 py-3 shadow-[var(--sombra-1)]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color:var(--amber-line)]/60 text-[15px] font-semibold text-[color:var(--amber)] tabular-nums">
            {data.metrics.attentionCount.toLocaleString("pt-BR")}
          </span>
          <div className="min-w-0 flex-[1_1_16rem]">
            <strong className="block text-[15px] text-foreground">
              {data.metrics.attentionCount === 1 ? "Movimentação precisa de decisão" : "Movimentações precisam de decisão"}
            </strong>
            <p className="m-0 text-[13px] text-muted-foreground">
              {formatCurrency(data.metrics.attentionAmount, currency)} sem vínculo ou evidência confirmada.{" "}
              {formatPercent(data.metrics.reconciliationRate)} do período conciliado.
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-10 max-[820px]:w-full">
            <Link href={link({ status: "PENDING" }, "#movimentacoes")} scroll={false}>
              Abrir fila de conciliação
            </Link>
          </Button>
        </section>
      ) : null}

      <Painel titulo="Entradas e saídas" descricao={data.account ? `${rotuloInstituicao(data.account.provider)}, ${data.account.displayName}. Transferências entre contas ficam de fora.` : undefined}>
        <GraficoFluxo pontos={data.chart} moeda={currency} passoDias={data.chartStep} />
      </Painel>

      <Painel
        id="movimentacoes"
        titulo="Movimentações"
        descricao="As 80 mais recentes do recorte."
        acao={<AcoesCabecalho acoes={[{ tipo: "conciliar" }]} discreta />}
      >
        {/* Estado é aba (é a pergunta principal da lista); escopo é filtro
            compacto. Eram duas fileiras de abas iguais, que liam como a
            mesma coisa repetida. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0 max-[820px]:w-full">
            <AbasLink
              rotulo="Estado da conciliação"
              abas={filters.map((item) => ({
                href: link({ status: item.value }, "#movimentacoes"),
                rotulo: item.label,
                contagem: item.value === "ALL" ? undefined : data.metrics.counts[item.value],
                ativa: filter === item.value,
              }))}
            />
          </div>
          <FiltroSelect
            rotulo="Classificação"
            valor={scope}
            opcoes={scopeFilters.map((item) => ({
              valor: item.value,
              rotulo:
                item.value !== "ALL" && data.metrics.scopeCounts[item.value]
                  ? `${item.label} (${data.metrics.scopeCounts[item.value].toLocaleString("pt-BR")})`
                  : item.label,
              href: link({ escopo: item.value }, "#movimentacoes"),
            }))}
          />
        </div>

        {/* A explicação do escopo é a regra da casa, não um parágrafo de
            abertura: fica em detalhe, a um toque de quem precisar. */}
        <details className="mb-2 text-[13px] text-muted-foreground [&_summary]:cursor-pointer [&_summary]:py-1">
          <summary>O que muda entre Empresa, Pessoal, Entre contas e A classificar</summary>
          <p className="m-0 mt-1 max-w-[70ch]">
            Uma conta só paga o mercado e paga o Porkbun. A separação acontece
            aqui: o que estiver como Empresa entra no resultado da Ávila, e o
            que for entre contas nunca entra.
          </p>
        </details>

        {linhas.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhuma movimentação neste recorte."
            descricao="Troque o período ou o filtro, ou sincronize as contas."
            acao={{ label: "Ver todas do período", href: link({ status: "ALL", escopo: "ALL" }, "#movimentacoes") }}
          />
        ) : (
          <TabelaMovimentacoes linhas={linhas} />
        )}
      </Painel>
    </AppShell>
  );
}
