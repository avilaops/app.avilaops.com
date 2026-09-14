"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FINANCE_SCOPES, SCOPE_LABELS, type FinanceScope } from "@/lib/finance-escopo";

/**
 * Marca uma linha do extrato como da empresa, pessoal ou entre contas.
 *
 * É a peça que faz a conta única funcionar: em vez de exigir dois bancos, a
 * separação acontece aqui, linha a linha, e fica gravada como decisão humana.
 */
export default function ScopePicker({
  transactionId,
  scope,
  source,
}: {
  transactionId: string;
  scope: string;
  source: string | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(scope);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: string) {
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setFailed(false);

    try {
      const response = await fetch(`/api/bank-transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: next }),
      });
      if (!response.ok) throw new Error("falhou");
      router.refresh();
    } catch {
      setCurrent(previous);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="scope-picker">
      <select
        value={current}
        disabled={saving}
        aria-label="Escopo da movimentação"
        className={`scope-select scope-${current.toLowerCase()}`}
        onChange={(event) => change(event.target.value)}
      >
        {FINANCE_SCOPES.map((item: FinanceScope) => (
          <option value={item} key={item}>
            {SCOPE_LABELS[item]}
          </option>
        ))}
      </select>
      {source === "REGRA" ? (
        <small className="scope-hint" title="Classificado por regra automática - confirme se estiver errado.">
          regra
        </small>
      ) : null}
      {failed ? <small className="form-error">não salvou</small> : null}
    </span>
  );
}
