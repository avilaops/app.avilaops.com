import ScoreRowActions from "@/components/ScoreRowActions";
import {
  BUREAU_LABELS,
  faixaDoScore,
  SUBJECT_LABELS,
  type ResumoScore,
} from "@/lib/credito";
import { formatShortDate } from "@/lib/format";

function variacaoTexto(variacao: number | null, bureau: string) {
  if (variacao === null) return "Primeira leitura neste birô";
  if (variacao === 0) return `Igual à leitura anterior (${bureau})`;
  const sinal = variacao > 0 ? "+" : "−";
  return `${sinal}${Math.abs(variacao)} desde a leitura anterior (${bureau})`;
}

/**
 * Um cartão por documento: o número grande da última leitura, a faixa, de
 * onde veio e há quanto tempo. Abaixo, a série. Sem leitura, o cartão diz
 * isso, em vez de desenhar um zero que pareceria score.
 */
export default function ScoreCard({ resumo }: { resumo: ResumoScore }) {
  const { atual, anterior, variacao, diasSemConferir, leituras } = resumo;
  const faixa = atual ? faixaDoScore(atual.score, atual.maxScore) : null;
  const alerta = diasSemConferir !== null && diasSemConferir > 30;

  return (
    <article className={`score-card${atual ? "" : " score-card-empty"}`}>
      <header className="score-card-head">
        <span className="eyebrow">{SUBJECT_LABELS[resumo.subjectKind]}</span>
        {faixa ? (
          <span className={`status-pill ${faixa.classe}`}>{faixa.rotulo}</span>
        ) : null}
      </header>

      {atual && faixa ? (
        <>
          <div className="score-value">
            <strong>{atual.score}</strong>
            <span>/ {atual.maxScore}</span>
          </div>
          <div className="score-bar" aria-hidden="true">
            <span
              className={faixa.classe}
              style={{ width: `${Math.round((atual.score / atual.maxScore) * 100)}%` }}
            />
          </div>
          <p className="score-meta">
            {BUREAU_LABELS[atual.bureau]} · lido em{" "}
            <time dateTime={atual.readAt.toISOString()}>{formatShortDate(atual.readAt)}</time>
            {alerta ? (
              <span className="negative"> · {diasSemConferir} dias sem conferir</span>
            ) : null}
          </p>
          <p className={`score-delta${variacao !== null && variacao < 0 ? " negative" : variacao ? " positive" : ""}`}>
            {variacaoTexto(variacao, anterior ? BUREAU_LABELS[anterior.bureau] : "")}
          </p>
        </>
      ) : (
        <p className="score-empty">
          Nenhuma leitura registrada. Abra o birô ou o app do banco e registre a
          primeira.
        </p>
      )}

      {leituras.length > 0 ? (
        <ul className="ios-list score-history" aria-label="Leituras anteriores">
          {leituras.slice(0, 8).map((leitura) => (
            <li key={leitura.id} className="ios-row ios-row-static">
              <div className="ios-row-label">
                <strong>
                  {leitura.score}
                  <small> / {leitura.maxScore}</small>
                </strong>
                <small>
                  {BUREAU_LABELS[leitura.bureau]} · {formatShortDate(leitura.readAt)}
                  {leitura.source === "N8N" ? " · automático" : ""}
                  {leitura.note ? ` · ${leitura.note}` : ""}
                </small>
              </div>
              <ScoreRowActions leituraId={leitura.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
