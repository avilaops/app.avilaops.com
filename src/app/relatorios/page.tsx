import { redirect } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import AppShell from "@/components/AppShell";
import CabecalhoFinanceiro from "@/components/financeiro/CabecalhoFinanceiro";
import Painel from "@/components/financeiro/Painel";
import { Button } from "@/components/shadcn/button";
import { ehDono, getAdmin } from "@/lib/auth";
import { getFinanceDashboard } from "@/lib/dashboard";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { contextoDaSecao } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

const EXPORTACOES = [
  {
    titulo: "Movimentações bancárias",
    descricao: "Entradas, saídas, contraparte, vínculo e estado de conciliação dos últimos 30 dias.",
    href: "/api/reports/transactions?range=30",
  },
  {
    titulo: "Fila de pendências",
    descricao: "Só o que ainda precisa de decisão ou evidência, nos últimos 90 dias.",
    href: "/api/reports/transactions?range=90&status=PENDING",
  },
  {
    titulo: "Resumo executivo",
    descricao: "Saldo, fluxo, taxa de conciliação e saúde da sincronização.",
    href: "/api/reports/summary?range=30",
  },
];

export default async function ReportsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");
  const data = await getFinanceDashboard(30, "ALL");
  const moeda = data.account?.currency ?? "BRL";
  const net = data.metrics.net;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="reports">
      <CabecalhoFinanceiro
        titulo="Relatórios"
        acoes={[]}
        descricao="Resumo dos últimos 30 dias e as exportações em CSV."
        voltar={contextoDaSecao("reports").voltar}
      />

      {/* Cinco números em cinco cartões empilhados ocupavam uma tela inteira
          do celular. São um resumo só: o resultado em destaque e os outros
          quatro numa grade embaixo. */}
      <Painel
        titulo="Últimos 30 dias"
        descricao={data.account ? `${data.account.displayName}. Transferências entre contas ficam de fora.` : undefined}
      >
        <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] min-[900px]:items-center">
          <div>
            <span className="block text-[13px] text-muted-foreground">Resultado</span>
            <strong
              className={cn(
                "block text-[1.75rem] leading-tight font-semibold tabular-nums",
                net > 0 ? "text-[color:var(--green)]" : net < 0 ? "text-[color:var(--red)]" : "text-foreground",
              )}
            >
              {formatCurrency(net, moeda)}
            </strong>
            <small className="text-[12px] text-muted-foreground">Entradas menos saídas</small>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 min-[600px]:grid-cols-4">
            {[
              ["Entradas", formatCurrency(data.metrics.credits, moeda)],
              ["Saídas", formatCurrency(data.metrics.debits, moeda)],
              ["Conciliação", formatPercent(data.metrics.reconciliationRate)],
              ["Atualização", data.account?.lastSyncAt ? formatDateTime(data.account.lastSyncAt) : "Ainda não sincronizada"],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="min-w-0">
                <dt className="text-[13px] text-muted-foreground">{rotulo}</dt>
                <dd className="m-0 text-[14px] text-foreground tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Painel>

      <Painel titulo="Exportações">
        <ul className="m-0 list-none p-0">
          {EXPORTACOES.map((item) => (
            <li
              key={item.href}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-[1_1_16rem]">
                <strong className="block text-[15px] font-semibold text-foreground">{item.titulo}</strong>
                <p className="m-0 text-[13px] text-muted-foreground">{item.descricao}</p>
              </div>
              <Button asChild variant="outline" className="min-h-10 max-[820px]:w-full">
                <a href={item.href}>
                  <Download aria-hidden="true" />
                  Exportar CSV
                </a>
              </Button>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3 flex items-start gap-2 text-[13px] text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[color:var(--green)]" />
          Cada exportação gera evento de auditoria. Nenhum relatório leva certificado, token, documento
          do pagador ou chave Pix.
        </p>
      </Painel>
    </AppShell>
  );
}
