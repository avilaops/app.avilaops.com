import { formatCurrency, formatShortDate } from "@/lib/format";

type ChartPoint = {
  date: string;
  credits: number;
  debits: number;
};

export default function CashFlowChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="chart-empty">
        <span>Sem movimentações no período.</span>
        <small>Sincronize o Éfi ou amplie o intervalo de análise.</small>
      </div>
    );
  }

  // Proporção 4:1. O painel passou a ocupar a largura inteira quando o quadro
  // de contagens saiu do lado dele, e a 3:1 o gráfico esticava para 370px de
  // altura num desktop de 1440 — cinco pontos ocupando meia tela. A conta é a
  // mesma; só a moldura ficou mais larga.
  const width = 960;
  const height = 240;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.credits, point.debits]),
  );
  const x = (index: number) =>
    left + (index * plotWidth) / Math.max(1, points.length - 1);
  const y = (value: number) =>
    top + plotHeight - (value / maxValue) * plotHeight;
  const creditLine = points
    .map((point, index) => `${x(index)},${y(point.credits)}`)
    .join(" ");
  const debitLine = points
    .map((point, index) => `${x(index)},${y(point.debits)}`)
    .join(" ");

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span>
          <i className="legend-credit" /> Entradas
        </span>
        <span>
          <i className="legend-debit" /> Saídas
        </span>
        <strong>Pico {formatCurrency(maxValue)}</strong>
      </div>
      <svg
        className="cash-flow-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Fluxo de entradas e saídas no período"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const lineY = top + plotHeight * ratio;
          return (
            <line
              x1={left}
              x2={width - right}
              y1={lineY}
              y2={lineY}
              key={ratio}
              className="chart-grid"
            />
          );
        })}
        <polyline points={creditLine} className="chart-line chart-credit" />
        <polyline points={debitLine} className="chart-line chart-debit" />
        {points.map((point, index) => (
          <g key={point.date}>
            <circle
              cx={x(index)}
              cy={y(point.credits)}
              r="3"
              className="chart-dot chart-dot-credit"
            />
            <circle
              cx={x(index)}
              cy={y(point.debits)}
              r="3"
              className="chart-dot chart-dot-debit"
            />
          </g>
        ))}
        <text x={left} y={height - 9} className="chart-label">
          {formatShortDate(points[0].date)}
        </text>
        <text
          x={width - right}
          y={height - 9}
          textAnchor="end"
          className="chart-label"
        >
          {formatShortDate(points.at(-1)?.date ?? points[0].date)}
        </text>
      </svg>
    </div>
  );
}
