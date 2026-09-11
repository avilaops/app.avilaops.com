import type { ProgressoMeta } from "@/lib/credito";
import { formatCurrency } from "@/lib/format";

/**
 * A meta de limpar o nome: quanto era, quanto já foi, quanto falta. O número
 * grande é o que falta, porque é a pergunta que a pessoa faz ao abrir.
 */
export default function MetaLimparNome({ meta }: { meta: ProgressoMeta }) {
  const concluida = meta.quantidade > 0 && meta.restante <= 0;
  return (
    <article className={`meta-card${concluida ? " meta-card-done" : ""}`}>
      <header className="score-card-head">
        <span className="eyebrow">Meta: limpar o nome</span>
        <span className={`status-pill ${concluida ? "status-paid" : "status-overdue"}`}>
          {concluida ? "Concluída" : `${meta.quantidadeQuitada} de ${meta.quantidade} quitadas`}
        </span>
      </header>
      <div className="meta-value">
        <strong className={concluida ? "positive" : "negative"}>
          {formatCurrency(meta.restante)}
        </strong>
        <span>{concluida ? "nada pendente no Serasa" : "ainda anotado no Serasa"}</span>
      </div>
      <div
        className="score-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meta.percentual}
        aria-label="Quitado do total anotado"
      >
        <span className="faixa-excelente" style={{ width: `${meta.percentual}%` }} />
      </div>
      <p className="score-meta">
        {formatCurrency(meta.quitado)} quitado de {formatCurrency(meta.total)} ·{" "}
        {meta.percentual}%
      </p>
    </article>
  );
}
