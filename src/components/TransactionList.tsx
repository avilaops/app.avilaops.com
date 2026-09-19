import Link from "next/link";
import ReconciliationControl from "@/components/ReconciliationControl";
import ScopePicker from "@/components/ScopePicker";
import { formatCurrency, formatDateTime } from "@/lib/format";

export type LinhaMovimentacao = {
  id: string;
  occurredAt: string;
  description: string;
  transactionType: string;
  counterpartyName: string | null;
  counterpartyDocument: string | null;
  counterpartySource: string | null;
  endToEndId: string | null;
  direction: string;
  amount: string;
  currency: string;
  scope: string;
  scopeSource: string | null;
  reconciliation: {
    status: string;
    referenceType: string | null;
    referenceId: string | null;
    note: string | null;
  } | null;
};

function rotuloEstado(status: string) {
  return (
    {
      PENDING: "Pendente",
      REVIEW: "Em revisão",
      MATCHED: "Conciliado",
      IGNORED: "Ignorado",
    }[status] ?? status
  );
}

/**
 * Movimentações como uma lista de linhas em grade, não como `<table>`. No
 * desktop as colunas se alinham como tabela; no celular cada linha vira um
 * cartão de três andares (o quê + valor, quem + quando, decisões). É um DOM
 * só — nada de renderizar duas vezes para esconder uma.
 */
export default function TransactionList({
  transactions,
}: {
  transactions: LinhaMovimentacao[];
}) {
  return (
    <div className="tx-list" role="table" aria-label="Movimentações bancárias">
      <div className="tx-head" role="row">
        <span role="columnheader">Data</span>
        <span role="columnheader">Movimentação</span>
        <span role="columnheader">Origem / destino</span>
        <span role="columnheader" className="tx-amount">
          Valor
        </span>
        <span role="columnheader">Escopo</span>
        <span role="columnheader">Vínculo</span>
        <span role="columnheader">Estado</span>
        <span role="columnheader" aria-label="Ações" />
      </div>

      {transactions.map((transacao) => {
        const reconciliation = transacao.reconciliation;
        const status = reconciliation?.status ?? "PENDING";
        const entrada = transacao.direction === "CREDIT";
        return (
          <div className="tx-row" role="row" key={transacao.id}>
            <time
              className="tx-date"
              role="cell"
              dateTime={transacao.occurredAt}
            >
              {formatDateTime(transacao.occurredAt)}
            </time>

            <div className="tx-kind" role="cell">
              <span
                className={
                  entrada ? "direction direction-credit" : "direction direction-debit"
                }
                aria-hidden="true"
              >
                {entrada ? "↙" : "↗"}
              </span>
              <span>
                <strong>{transacao.description}</strong>
                <small>{transacao.transactionType}</small>
              </span>
            </div>

            <span className="tx-party" role="cell">
              {transacao.counterpartyName ? (
                // No desktop a coluna corta nomes longos com reticências, e a
                // etiqueta de origem some junto: o `title` é o que garante que
                // a procedência continue alcançável nas duas larguras.
                <span
                  title={
                    transacao.counterpartySource === "COMPROVANTE"
                      ? `${transacao.counterpartyName} — identificado pelo comprovante Pix${
                          transacao.counterpartyDocument
                            ? ` (${transacao.counterpartyDocument})`
                            : ""
                        }. O extrato do Efí não traz este nome.`
                      : transacao.counterpartyName
                  }
                >
                  {transacao.counterpartyName}
                  {transacao.counterpartySource === "COMPROVANTE" ? (
                    <small className="party-origem">comprovante</small>
                  ) : null}
                </span>
              ) : (
                <span
                  className="muted"
                  title={
                    entrada
                      ? "O Éfi não identifica o pagador em Pix recebido fora de cobrança - a resposta da API não traz esse campo."
                      : "O Éfi não devolveu o favorecido nesta movimentação."
                  }
                >
                  Não informado
                </span>
              )}
            </span>

            <span
              className={entrada ? "tx-amount money positive" : "tx-amount money"}
              role="cell"
            >
              {entrada ? "+" : "−"}{" "}
              {formatCurrency(transacao.amount, transacao.currency)}
            </span>

            <span className="tx-scope" role="cell">
              <ScopePicker
                transactionId={transacao.id}
                scope={transacao.scope}
                source={transacao.scopeSource}
              />
            </span>

            <span className="tx-ref" role="cell">
              {reconciliation?.referenceId ? (
                <span className="reference">
                  {reconciliation.referenceType === "LEDGER" ? (
                    <Link href="/financeiro/contas?status=ALL&scope=ALL">
                      Conta #{reconciliation.referenceId}
                    </Link>
                  ) : reconciliation.referenceType === "COMPROVANTE" ? (
                    // O identificador inteiro não cabe na coluna, e cortado no
                    // meio não serve para conferir nada: fica no title, onde dá
                    // para ler e comparar com o comprovante.
                    <abbr
                      className="reference-comprovante"
                      title={`Comprovante Pix ${reconciliation.referenceId}`}
                    >
                      Comprovante
                    </abbr>
                  ) : (
                    `${reconciliation.referenceType} · ${reconciliation.referenceId}`
                  )}
                </span>
              ) : (
                <span className="muted">Sem vínculo</span>
              )}
            </span>

            <span className="tx-state" role="cell">
              <span className={`status-pill status-${status.toLowerCase()}`}>
                {rotuloEstado(status)}
              </span>
            </span>

            <span className="tx-actions" role="cell">
              <ReconciliationControl
                transactionId={transacao.id}
                currentStatus={status}
                referenceType={reconciliation?.referenceType}
                referenceId={reconciliation?.referenceId}
                note={reconciliation?.note}
                endToEndId={transacao.endToEndId}
                counterpartyName={transacao.counterpartyName}
                counterpartySource={transacao.counterpartySource}
                scope={transacao.scope}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
