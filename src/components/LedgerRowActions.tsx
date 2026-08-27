"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LedgerRowActions({
  entryId,
  status,
  direction,
}: {
  entryId: string;
  status: string;
  direction: "PAYABLE" | "RECEIVABLE";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ledger-entries/${entryId}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao atualizar.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="ledger-actions">
      {status === "OPEN" ? (
        <>
          <button
            type="button"
            className="small-primary"
            disabled={busy}
            onClick={() =>
              send("PATCH", { status: "PAID", paidAt: new Date().toISOString() })
            }
          >
            {direction === "PAYABLE" ? "Dar baixa" : "Recebi"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => send("DELETE")}
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => send("PATCH", { status: "OPEN" })}
        >
          Reabrir
        </button>
      )}
      {error ? <small className="form-error">{error}</small> : null}
    </span>
  );
}
