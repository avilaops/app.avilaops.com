import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoFinanceiro from "@/components/financeiro/CabecalhoFinanceiro";
import { AbasLink } from "@/components/financeiro/Filtros";
import { FaixaIndicadores, Indicador } from "@/components/financeiro/Indicadores";
import Painel from "@/components/financeiro/Painel";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { contextoDaSecao } from "@/lib/navegacao";
import LedgerList from "@/components/LedgerList";
import { ehDono, getAdmin } from "@/lib/auth";
import {
  LEDGER_DIRECTIONS,
  LEDGER_STATUSES,
  listLedgerEntries,
  type LedgerDirection,
  type LedgerStatus,
} from "@/lib/contas";
import { isFinanceScope, SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";
import { contar, formatCurrency } from "@/lib/format";

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

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; status?: string; scope?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");

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
    <AppShell adminName={admin.nome} papel={admin.role} section="ledger">
      <CabecalhoFinanceiro
        titulo="Contas a pagar e receber"
        descricao="O que vence, o que já venceu e o que a conciliação bancária deu por quitado."
        voltar={contextoDaSecao("ledger").voltar}
      />

      <FaixaIndicadores rotulo="Resumo das contas">
        <Indicador
          rotulo="A receber em aberto"
          valor={formatCurrency(totals.openReceivable)}
          tom="entrada"
          detalhe={totals.overdueReceivable > 0 ? `${formatCurrency(totals.overdueReceivable)} já vencido` : "Nada vencido"}
        />
        <Indicador
          rotulo="A pagar em aberto"
          valor={formatCurrency(totals.openPayable)}
          tom="saida"
          detalhe={totals.overduePayable > 0 ? `${formatCurrency(totals.overduePayable)} já vencido` : "Nada vencido"}
        />
        <Indicador
          rotulo="Resultado em aberto"
          valor={formatCurrency(totals.projectedNet)}
          tom={totals.projectedNet >= 0 ? "entrada" : "saida"}
          detalhe="Recebíveis menos obrigações em aberto, sem incluir o saldo bancário"
        />
        <Indicador
          rotulo="Vencem em 7 dias"
          valor={totals.dueNext7Days.toLocaleString("pt-BR")}
          tom={totals.overdueCount > 0 ? "atencao" : "neutro"}
          detalhe={totals.overdueCount > 0 ? `${contar(totals.overdueCount, "conta já vencida", "contas já vencidas")}` : "Nenhuma vencida"}
        />
      </FaixaIndicadores>

      <Painel
        titulo={scope === "ALL" ? "Empresa e pessoal" : SCOPE_LABELS[scope as FinanceScope]}
        acao={
          <AbasLink
            rotulo="Escopo"
            abas={scopeTabs.map((item) => ({ href: query({ scope: item.value }), rotulo: item.label, ativa: scope === item.value }))}
          />
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="min-w-0 max-[820px]:w-full">
            <AbasLink
              rotulo="Tipo"
              abas={directionTabs.map((item) => ({ href: query({ direction: item.value }), rotulo: item.label, ativa: direction === item.value }))}
            />
          </div>
          <div className="min-w-0 max-[820px]:w-full">
            <AbasLink
              rotulo="Situação"
              abas={statusTabs.map((item) => ({ href: query({ status: item.value }), rotulo: item.label, ativa: status === item.value }))}
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <EstadoVazio
            compacto
            titulo="Nenhuma conta neste recorte."
            descricao="Lance um compromisso em Novo lançamento ou troque o filtro."
          />
        ) : (
          <LedgerList rows={rows} />
        )}
      </Painel>
    </AppShell>
  );
}
