import EstadoVazio from "@/components/hub-social/EstadoVazio";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import type { Evidencia } from "@/lib/evidencia";
import type { Ga4OverviewMetrics } from "@/lib/google-analytics";
import { OBSERVACAO_GA4, ORIGEM_GA4 } from "./tons";

export type Ga4ResumoProps = {
  ga4: Ga4OverviewMetrics;
  lidoEm: string;
};

const formatoPercentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export default function Ga4Resumo({ ga4, lidoEm }: Ga4ResumoProps) {
  const evidencia = (rotulo: string, formula: string): Evidencia => ({
    rotulo,
    origem: ORIGEM_GA4,
    formula,
    lidoEm,
    observacao: OBSERVACAO_GA4,
    bruto: ga4,
  });

  return (
    <div className="flex flex-col gap-4">
      <GradeMetricas rotulo="Tráfego dos últimos 30 dias">
        <Metrica
          rotulo="Sessões (30d)"
          valor={ga4.sessions30Days.toLocaleString("pt-BR")}
          evidencia={evidencia("Sessões (30d)", "campo sessions30Days devolvido por getGa4OverviewMetrics()")}
        />
        <Metrica
          rotulo="Usuários (30d)"
          valor={ga4.totalUsers30Days.toLocaleString("pt-BR")}
          evidencia={evidencia("Usuários (30d)", "campo totalUsers30Days devolvido por getGa4OverviewMetrics()")}
        />
        <Metrica
          rotulo="Visualizações (30d)"
          valor={ga4.pageViews30Days.toLocaleString("pt-BR")}
          evidencia={evidencia("Visualizações (30d)", "campo pageViews30Days devolvido por getGa4OverviewMetrics()")}
        />
        <Metrica
          rotulo="Taxa de rejeição"
          valor={`${formatoPercentual.format(ga4.bounceRate)}%`}
          evidencia={evidencia("Taxa de rejeição", "campo bounceRate devolvido por getGa4OverviewMetrics(), já em porcentagem")}
        />
      </GradeMetricas>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-[17px] leading-tight min-[821px]:text-[15px]">Origem do tráfego</CardTitle>
          <CardDescription>Usuários por canal nos últimos 30 dias.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          {ga4.topChannels.length === 0 ? (
            <EstadoVazio compacto titulo="Nenhum canal informado." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {ga4.topChannels.map((canal) => (
                <li key={canal.channel} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{canal.channel}</span>
                    <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">
                      {canal.users.toLocaleString("pt-BR")} usuários ({formatoPercentual.format(canal.percentage)}%)
                    </span>
                  </div>
                  <progress
                    value={canal.percentage}
                    max={100}
                    aria-label={`${canal.channel}: ${formatoPercentual.format(canal.percentage)}%`}
                    className="h-2 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ListaChaveValor
        titulo="Integrações do Google"
        descricao="O que este painel lê hoje."
        itens={[
          { rotulo: "Google Meu Negócio", valor: "Perfis, notas e avaliações", status: "connected" },
          { rotulo: "Google Analytics 4", valor: "Sessões, usuários e canais", status: "connected" },
        ]}
      />

      <EstadoVazio compacto titulo="Ads, Trends, Tag Manager e Merchant ainda não estão integrados." />
    </div>
  );
}
