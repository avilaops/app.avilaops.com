"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/shadcn/chart";
import type { PontoFluxo } from "@/lib/fluxo-diario";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

const config = {
  entradas: { label: "Entradas", color: "var(--green)" },
  saidas: { label: "Saídas", color: "var(--red)" },
} satisfies ChartConfig;

// O dia vem como "2026-09-28"; meio-dia evita que o fuso puxe para o dia anterior.
const comoData = (dia: string) => new Date(`${dia}T12:00:00-03:00`);
const rotuloCurto = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const rotuloLongo = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

type Linha = PontoFluxo & { saidasNegativas: number };

function Dica({
  active,
  payload,
  moeda,
  semanal,
}: {
  active?: boolean;
  payload?: Array<{ payload: Linha }>;
  moeda: string;
  semanal: boolean;
}) {
  const ponto = payload?.[0]?.payload;
  if (!active || !ponto) return null;
  const resultado = ponto.entradas - ponto.saidas;
  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2 text-[13px] shadow-md">
      <p className="m-0 mb-1.5 font-medium text-foreground">
        {semanal ? `Semana de ${rotuloCurto.format(comoData(ponto.dia))}` : rotuloLongo.format(comoData(ponto.dia))}
      </p>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 tabular-nums">
        <dt className="font-sans text-muted-foreground">Entradas</dt>
        <dd className="m-0 text-right text-[color:var(--green)]">{formatCurrency(ponto.entradas, moeda)}</dd>
        <dt className="font-sans text-muted-foreground">Saídas</dt>
        <dd className="m-0 text-right text-[color:var(--red)]">{formatCurrency(ponto.saidas, moeda)}</dd>
        <dt className="font-sans text-muted-foreground">Resultado</dt>
        <dd className="m-0 text-right text-foreground">{formatCurrency(resultado, moeda)}</dd>
      </dl>
    </div>
  );
}

/**
 * Entradas e saídas em barras divergentes: entrada para cima, saída para
 * baixo, uma barra por dia (por semana no período de um ano).
 *
 * Substitui o SVG de linha feito à mão, que ligava só os dias com movimento
 * (cinco pontos em trinta dias), não tinha eixo Y e só dava data nas pontas.
 * Aqui todo dia existe, dia sem movimento é zero visível, o eixo Y diz a
 * ordem de grandeza e o tooltip dá o valor exato.
 */
export default function GraficoFluxo({
  pontos,
  moeda = "BRL",
  passoDias = 1,
}: {
  pontos: PontoFluxo[];
  moeda?: string;
  passoDias?: number;
}) {
  const linhas: Linha[] = pontos.map((p) => ({ ...p, saidasNegativas: -p.saidas }));
  const semanal = passoDias > 1;
  const vazio = pontos.every((p) => p.entradas === 0 && p.saidas === 0);

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[13px] text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px] bg-[color:var(--green)]" /> Entradas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px] bg-[color:var(--red)]" /> Saídas
        </span>
        <span className="ml-auto">{semanal ? "Por semana" : "Por dia"}</span>
      </div>
      <ChartContainer
        config={config}
        className="aspect-auto h-60 w-full max-[820px]:h-48"
        role="img"
        aria-label={
          vazio
            ? "Nenhuma entrada ou saída no período."
            : `Entradas e saídas ${semanal ? "por semana" : "por dia"}, de ${rotuloCurto.format(comoData(pontos[0].dia))} a ${rotuloCurto.format(comoData(pontos.at(-1)!.dia))}.`
        }
      >
        <BarChart data={linhas} stackOffset="sign" margin={{ top: 8, right: 20, bottom: 0, left: 4 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis
            dataKey="dia"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(dia: string) => rotuloCurto.format(comoData(dia))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tickCount={5}
            tickFormatter={(valor: number) => formatCompactCurrency(valor, moeda)}
          />
          <ReferenceLine y={0} stroke="var(--line)" />
          <ChartTooltip
            cursor={{ fill: "var(--hover-bg)" }}
            content={<Dica moeda={moeda} semanal={semanal} />}
          />
          <Bar dataKey="entradas" stackId="fluxo" fill="var(--color-entradas)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="saidasNegativas" stackId="fluxo" fill="var(--color-saidas)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
