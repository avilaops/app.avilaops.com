"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";

type ImportResult = {
  accounts: Array<{ id: string; currency: string; created: number; updated: number }>;
  credits: number;
  debits: number;
  ignored: number;
  scopeCounts: Record<string, number>;
  skipped: Array<{ line: number; reason: string }>;
  skippedCount: number;
  periodStart: string | null;
  periodEnd: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export default function WiseImportPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("arquivo", file);
      const response = await fetch("/api/integrations/wise/import", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao importar.");

      setResult(payload);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível importar.",
      );
    } finally {
      setBusy(false);
    }
  }

  function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    void send(file);
  }

  return (
    <div className="import-panel">
      <div
        className={`dropzone${busy ? " dropzone-busy" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          pick(event.dataTransfer.files?.[0]);
        }}
      >
        <strong>Arraste o CSV da Wise aqui</strong>
        <span>
          Wise → Conta → Extrato → Exportar → CSV. O período pode se sobrepor a
          uma importação anterior: linha repetida é atualizada, não duplicada.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => pick(event.target.files?.[0])}
        />
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Importando…" : "Escolher arquivo"}
        </button>
        {fileName ? <small>{fileName}</small> : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="import-result" role="status">
          <h3>Extrato importado</h3>
          <p>
            {formatDate(result.periodStart)} a {formatDate(result.periodEnd)} ·{" "}
            {result.credits} entradas e {result.debits} saídas.
          </p>

          <table className="import-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Novas</th>
                <th>Atualizadas</th>
              </tr>
            </thead>
            <tbody>
              {result.accounts.map((account) => (
                <tr key={account.id}>
                  <td>Wise · {account.currency}</td>
                  <td>{account.created}</td>
                  <td>{account.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="import-scopes">
            {Object.entries(result.scopeCounts).map(([scope, count]) => (
              <li key={scope}>
                <span className={`status-pill scope-${scope.toLowerCase()}`}>
                  {SCOPE_LABELS[scope as FinanceScope] ?? scope}
                </span>
                {count}
              </li>
            ))}
          </ul>

          {result.ignored > 0 ? (
            <p className="muted">
              {result.ignored} linhas entraram já ignoradas: estorno de compra e
              conversão entre saldos não são receita nem despesa.
            </p>
          ) : null}

          {result.skippedCount > 0 ? (
            <details>
              <summary>{result.skippedCount} linhas descartadas</summary>
              <ul>
                {result.skipped.map((item) => (
                  <li key={item.line}>
                    Linha {item.line}: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
